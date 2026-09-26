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
    buildAv1EncodedKey,
    buildFrameKey,
    uploadFileToS3,
} from '../utility/s3.js';
import { downloadToFile } from '../utility/download.js';
import { runFfmpeg } from '../utility/ffmpeg.js';
import {
    probeDuration,
    assertSupportedDuration,
    pickFrameTimestamps,
    extractFrames,
} from '../utility/frameExtraction.js';
import { DEFAULT_ENCODING_SETTINGS } from '../config/encodingConfig.js';

const CONTAINER_CONTENT_TYPES = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
}

const TMP_ROOT = process.env.TRANSCODE_TMP_DIR || os.tmpdir();

// Creates the transcode_jobs row for a video if one doesn't already exist yet.
// Shared by the HTTP route and the SQS worker, since either can be the first
// to see a given videoId.
export async function ensureTranscodeJob(videoId, sourceUrl) {
    const existing = await findTranscodeJobById(videoId)
    if (existing) {
        return { job: existing, created: false }
    }
    const job = await createTranscodeJob(videoId, sourceUrl, DEFAULT_ENCODING_SETTINGS)
    return { job, created: true }
}

// Downloads the source video, extracts one random frame per 10s window (uploaded to
// the media bucket as {videoId}/frames/frame_N.jpg), runs the AV1 encode, uploads the
// result to the media bucket as {videoId}/av1.{container}, and updates the job row at each stage.
// Any step failing (including a video over 60s) fails the whole job.
// Assumes a transcode_jobs row already exists for videoId (see ensureTranscodeJob).
export async function runTranscodeJob(videoId) {
    const job = await findTranscodeJobById(videoId)
    if (!job) {
        throw new Error(`No transcode job found for video ${videoId}`)
    }

    const { source_url: sourceUrl, settings } = job
    const jobDir = path.join(TMP_ROOT, `transcode-${videoId}`);

    try {
        await fs.mkdir(jobDir, { recursive: true });
        const inputPath = path.join(jobDir, 'source.input');
        const outputPath = path.join(jobDir, `output.${settings.container}`);

        await markTranscodeProcessing(videoId);

        await downloadToFile(sourceUrl, inputPath);

        // Frames first: it's cheap and rejects over-length videos before the slow encode.
        const duration = await probeDuration(inputPath);
        assertSupportedDuration(duration);
        const frames = await extractFrames(inputPath, jobDir, pickFrameTimestamps(duration));
        for (const frame of frames) {
            await uploadFileToS3(MEDIA_BUCKET, buildFrameKey(videoId, frame.index), frame.path, 'image/jpeg');
        }

        await runFfmpeg(inputPath, outputPath, settings);

        const outputKey = buildAv1EncodedKey(videoId, settings.container);
        const contentType = CONTAINER_CONTENT_TYPES[settings.container] || 'application/octet-stream';
        await uploadFileToS3(MEDIA_BUCKET, outputKey, outputPath, contentType);

        return await markTranscodeCompleted(videoId, outputKey);
    } catch (err) {
        await markTranscodeFailed(videoId, err.message).catch((updateErr) => {
            console.error(`Failed to record failure for transcode job ${videoId}:`, updateErr);
        });
        throw err;
    } finally {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
}
