import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    createTranscodeJob,
    findTranscodeJobById,
    markTranscodeProcessing,
    markTranscodeCompleted,
    markTranscodeFailed,
} from "../models/transcodeModels.js"
import {
    MEDIA_BUCKET,
    ORIGINAL_BUCKET,
    buildEncodedKey,
    buildFrameKey,
    uploadFileToS3,
} from '../utility/s3.js';
import { downloadFromS3 } from '../utility/download.js';
import { runFfmpeg } from '../utility/ffmpeg.js';
import {
    probeDuration,
    probeDimensions,
    assertSupportedDuration,
    pickFrameTimestamps,
    extractFrames,
} from '../utility/frameExtraction.js';
import { DEFAULT_ENCODING_SETTINGS } from '../config/encodingConfig.js';
import { logError } from "../utility/logger.js";

const CONTAINER_CONTENT_TYPES = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
}

const TMP_ROOT = process.env.TRANSCODE_TMP_DIR || os.tmpdir();

// Creates the transcode_jobs row for a video if one doesn't already exist yet.
// sourceKey is the original's object key in ORIGINAL_BUCKET.
export async function ensureTranscodeJob(videoId, sourceKey) {
    const existing = await findTranscodeJobById(videoId)
    if (existing) {
        return { job: existing, created: false }
    }
    const job = await createTranscodeJob(videoId, sourceKey, DEFAULT_ENCODING_SETTINGS)
    return { job, created: true }
}

// Downloads the source video from the original bucket, extracts one random frame per 10s window (uploaded to
// the media bucket as {videoId}/frames/{videoId}_frame001.jpg), runs the AV1 encode, uploads the
// result to the media bucket as
// {videoId}/{videoId}_{codec}_{N}_{size}MB.{container}, and updates the job row at each stage.
// Any step failing (including a video over 120s) fails the whole job.
// Assumes a transcode_jobs row already exists for videoId (see ensureTranscodeJob).
export async function runTranscodeJob(videoId) {
    const job = await findTranscodeJobById(videoId)
    if (!job) {
        throw new Error(`No transcode job found for video ${videoId}`)
    }

    const { source_key: sourceKey, settings } = job
    const jobDir = path.join(TMP_ROOT, `transcode-${videoId}`);

    try {
        await fs.mkdir(jobDir, { recursive: true });
        const inputPath = path.join(jobDir, 'source.input');
        const outputPath = path.join(jobDir, `output.${settings.container}`);

        await markTranscodeProcessing(videoId);

        await downloadFromS3(ORIGINAL_BUCKET, sourceKey, inputPath);

        // Frames first: it's cheap and rejects over-length videos before the slow encode.
        const duration = await probeDuration(inputPath);
        assertSupportedDuration(duration);
        const frames = await extractFrames(inputPath, jobDir, pickFrameTimestamps(duration));
        for (const frame of frames) {
            await uploadFileToS3(MEDIA_BUCKET, buildFrameKey(videoId, frame.index), frame.path, 'image/jpeg');
        }

        await runFfmpeg(inputPath, outputPath, settings);

        const { width, height } = await probeDimensions(outputPath);
        const { size: sizeBytes } = await fs.stat(outputPath);
        const { size: sourceBytes } = await fs.stat(inputPath);
        if (sizeBytes >= sourceBytes) {
            logError(`Encoded file for videoId=${videoId} is not smaller than the original (${sourceBytes} -> ${sizeBytes} bytes) — consider a higher crf in encodingConfig.js`);
        }
        const outputKey = buildEncodedKey(videoId, {
            videoCodec: settings.videoCodec,
            width,
            height,
            sizeBytes,
            container: settings.container,
        });
        const contentType = CONTAINER_CONTENT_TYPES[settings.container] || 'application/octet-stream';
        await uploadFileToS3(MEDIA_BUCKET, outputKey, outputPath, contentType);

        const completedJob = await markTranscodeCompleted(videoId, outputKey);
        return { job: completedJob, sourceBytes, encodedBytes: sizeBytes };
    } catch (err) {
        await markTranscodeFailed(videoId, err.message).catch((updateErr) => {
            logError(`Failed to record failure for transcode job ${videoId}:`, updateErr);
        });
        throw err;
    } finally {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
}
