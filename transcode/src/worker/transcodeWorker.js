import { Consumer } from 'sqs-consumer';
import { sqsClient, TRANSCODE_QUEUE_URL } from '../config/sqsConfig.js';
import { ensureTranscodeJob, runTranscodeJob } from '../services/transcodeService.js';
import { log, logError } from '../utility/logger.js';
import { ORIGINAL_BUCKET, getObjectSize } from '../utility/s3.js';

// Lease held on an in-flight message. ffmpeg encodes can run for minutes, so the
// consumer extends it every SQS_HEARTBEAT_INTERVAL seconds (ChangeMessageVisibility)
// until the handler resolves. heartbeatInterval must be < visibilityTimeout.
const VISIBILITY_TIMEOUT = Number(process.env.SQS_VISIBILITY_TIMEOUT) || 300;
const HEARTBEAT_INTERVAL = Number(process.env.SQS_HEARTBEAT_INTERVAL) || 60;

// Consumes messages whose body is JSON: { videoId, key } — key is the original's S3 object
// key in the original bucket (sent by the upload service when an upload completes). Encoding settings are
// global (src/config/encodingConfig.js), not configurable per message.
//
// Resolving deletes the message (ack). Throwing leaves it on the queue — SQS makes
// it visible again after the visibility timeout and redelivers it, up to the queue's
// maxReceiveCount before it goes to the dead-letter queue (both configured on the
// queue itself, not here).
async function processMessage(message) {
  let payload;
  try {
    payload = JSON.parse(message.Body);
  } catch {
    throw new Error(`Bad transcode message (MessageId=${message.MessageId}): body is not valid JSON`);
  }

  const { videoId, key } = payload;
  if (!videoId || !key) {
    throw new Error(`Bad transcode message (MessageId=${message.MessageId}): videoId and key are required`);
  }

  const originalBytes = await getObjectSize(ORIGINAL_BUCKET, key);
  log(`Transcode message received: videoId=${videoId} (original ${originalBytes === null ? 'missing' : formatMb(originalBytes)})`);

  const { job, created } = await ensureTranscodeJob(videoId, key);
  if (!created && job.status === 'completed') {
    log(`Transcode message skipped: videoId=${videoId} already completed`);
    return; // already encoded on a previous delivery — ack so it isn't redelivered
  }

  try {
    const { sourceBytes, encodedBytes } = await runTranscodeJob(videoId);
    log(`Transcode message processed: videoId=${videoId} (original ${formatMb(sourceBytes)} -> encoded ${formatMb(encodedBytes)})`);
  } catch (err) {
    // The original is gone from the bucket — retrying can't bring it back, so ack the
    // message instead of letting SQS redeliver it forever. runTranscodeJob has already
    // marked the job 'failed' with this error.
    if (err.name === 'NoSuchKey') {
      logError(`Transcode failed for videoId=${videoId}: original ${key} not found in bucket, giving up`);
      return;
    }
    throw err;
  }
}

export function startTranscodeWorker() {
  if (!TRANSCODE_QUEUE_URL) {
    throw new Error('TRANSCODE_QUEUE_URL not set — the SQS worker is the only way this service receives jobs');
  }

  const consumer = Consumer.create({
    queueUrl: TRANSCODE_QUEUE_URL,
    sqs: sqsClient,
    handleMessage: processMessage,
    batchSize: 1, // ffmpeg is CPU-bound — process one video at a time
    waitTimeSeconds: 20, // long polling
    visibilityTimeout: VISIBILITY_TIMEOUT,
    heartbeatInterval: HEARTBEAT_INTERVAL,
  });

  // sqs-consumer wraps the handler's error; the original is on err.cause.
  consumer.on('processing_error', (err, message) => {
    const { videoId } = safeParse(message?.Body);
    logError(`Transcode failed for videoId=${videoId}:`, err.cause?.message ?? err.message);
  });

  consumer.on('error', (err) => {
    logError('SQS consumer error:', err.message);
  });

  consumer.start();
  log(`Transcode worker polling SQS queue ${TRANSCODE_QUEUE_URL}`);
  return consumer;
}

// Bytes -> "41.1MB" (MiB, 1 decimal), same rule as the size in the encoded file's name.
function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
