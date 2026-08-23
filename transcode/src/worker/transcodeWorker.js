import { Worker } from 'bullmq';
import { redisConnection } from './redisConnection.js';
import { ensureTranscodeJob, runTranscodeJob } from '../services/transcodeService.js';

const QUEUE_NAME = process.env.TRANSCODE_QUEUE_NAME || 'av1-transcode';
const CONCURRENCY = Number(process.env.TRANSCODE_CONCURRENCY) || 1; // ffmpeg is CPU-heavy — keep this low

// Consumes jobs shaped { videoId, url }. Encoding settings are global —
// see src/config/encodingConfig.js — not configurable per job.
async function processQueueJob(bullJob) {
  const { videoId, url } = bullJob.data;

  if (!videoId || !url) {
    throw new Error(`Bad transcode job payload (bullJob.id=${bullJob.id}): videoId and url are required`);
  }

  const { job, created } = await ensureTranscodeJob(videoId, url);
  if (!created && job.status === 'completed') {
    return job; // already done — don't redo the encode
  }

  return runTranscodeJob(videoId);
}

export function startTranscodeWorker() {
  const worker = new Worker(QUEUE_NAME, processQueueJob, {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  });

  worker.on('completed', (bullJob) => {
    console.log(`Transcode job completed: videoId=${bullJob.data.videoId}`);
  });

  worker.on('failed', (bullJob, err) => {
    console.error(`Transcode job failed: videoId=${bullJob?.data?.videoId}`, err);
  });

  console.log(`Transcode worker listening on queue "${QUEUE_NAME}" (concurrency=${CONCURRENCY})`);
  return worker;
}
