import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    createTranscodeJob,
    findTranscodeJobById,
    markTranscodeProcessing,
    saveTranscodeOutput,
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
import { ENCODING_OUTPUTS } from '../config/encodingOutputs.js';
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
    const job = await createTranscodeJob(videoId, sourceKey, ENCODING_OUTPUTS)
    return { job, created: true }
}

// The outputs a job should end up with. New jobs record ENCODING_OUTPUTS (an array) as
// their settings; jobs from before H.264 was added recorded a single AV1 settings object,
// so they fall back to the current ENCODING_OUTPUTS (their AV1 output is already saved).
export function plannedOutputs(job) {
    return Array.isArray(job.settings) ? job.settings : ENCODING_OUTPUTS
}

// Planned outputs not yet in job.outputs, in encode order.
export function missingOutputs(job) {
    return plannedOutputs(job).filter((settings) => !job.outputs?.[settings.name])
}

// Downloads the source video from the original bucket once, extracts one random frame per 10s
// window (uploaded to the media bucket as {videoId}/frames/{videoId}_frame001.jpg), then encodes
// each missing output (H.264, then AV1 — see src/config/encodingOutputs.js) from that same
// original, never from another output. Each finished output is uploaded to the media bucket as
// {videoId}/{videoId}_{codec}_{N}_{size}MB.{container}, saved in transcode_jobs.outputs, and
// passed to onOutput(name, key, sizeBytes) straight away — so the fast H.264 encode reaches the feed
// without waiting for AV1. Outputs already saved by an earlier attempt are skipped.
// Any step failing (including a video over 120s) fails the job; a retry resumes from the
// first missing output. Assumes a transcode_jobs row already exists (see ensureTranscodeJob).
export async function runTranscodeJob(videoId, onOutput = async () => {}) {
    const job = await findTranscodeJobById(videoId)
    if (!job) {
        throw new Error(`No transcode job found for video ${videoId}`)
    }

    const outputs = missingOutputs(job)
    const unnamed = outputs.find((settings) => !settings.name)
    if (unnamed) {
        throw new Error(`Encoding output for ${unnamed.videoCodec} has no name — set name (e.g. 'h264') in its config`)
    }

    const { source_key: sourceKey } = job
    const jobDir = path.join(TMP_ROOT, `transcode-${videoId}`);

    try {
        await fs.mkdir(jobDir, { recursive: true });
        const inputPath = path.join(jobDir, 'source.input');

        await markTranscodeProcessing(videoId);

        await downloadFromS3(ORIGINAL_BUCKET, sourceKey, inputPath);
        const { size: sourceBytes } = await fs.stat(inputPath);

        // Frames first: it's cheap and rejects over-length videos before the slow encodes.
        // Skipped when an earlier attempt already saved an output (its frames went up first).
        const duration = await probeDuration(inputPath);
        assertSupportedDuration(duration);
        if (Object.keys(job.outputs || {}).length === 0) {
            const frames = await extractFrames(inputPath, jobDir, pickFrameTimestamps(duration));
            for (const frame of frames) {
                await uploadFileToS3(MEDIA_BUCKET, buildFrameKey(videoId, frame.index), frame.path, 'image/jpeg');
            }
        }

        const encodedBytes = {}
        for (const settings of outputs) {
            const outputPath = path.join(jobDir, `output_${settings.name}.${settings.container}`);
            await runFfmpeg(inputPath, outputPath, settings);

            const { width, height } = await probeDimensions(outputPath);
            const { size: sizeBytes } = await fs.stat(outputPath);
            const outputKey = buildEncodedKey(videoId, {
                videoCodec: settings.videoCodec,
                width,
                height,
                sizeBytes,
                container: settings.container,
            });
            const contentType = CONTAINER_CONTENT_TYPES[settings.container] || 'application/octet-stream';
            await uploadFileToS3(MEDIA_BUCKET, outputKey, outputPath, contentType);

            await saveTranscodeOutput(videoId, settings.name, outputKey);
            await onOutput(settings.name, outputKey, sizeBytes);
            encodedBytes[settings.name] = sizeBytes;

            // done with this output — free the disk space before the next encode
            await fs.rm(outputPath, { force: true });
        }

        const completedJob = await markTranscodeCompleted(videoId);
        return { job: completedJob, sourceBytes, encodedBytes };
    } catch (err) {
        await markTranscodeFailed(videoId, err.message).catch((updateErr) => {
            logError(`Failed to record failure for transcode job ${videoId}:`, updateErr);
        });
        throw err;
    } finally {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
}
