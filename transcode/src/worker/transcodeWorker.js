import { Consumer } from 'sqs-consumer';
import { sqsClient, TRANSCODE_QUEUE_URL, TRANSCODE_COMPLETED_QUEUE_URL } from '../config/sqsConfig.js';
import { ensureTranscodeJob, runTranscodeJob, missingOutputs } from '../services/transcodeService.js';
import { markTranscodeCompleted } from '../models/transcodeModels.js';
import { log, logError } from '../utility/logger.js';
import { MEDIA_BUCKET, ORIGINAL_BUCKET, getObjectSize } from '../utility/s3.js';
import { sendTranscodeCompleted } from '../utility/sqs.js';

// Lease held on an in-flight message. ffmpeg encodes can run for minutes, so the
// consumer extends it every SQS_HEARTBEAT_INTERVAL seconds (ChangeMessageVisibility)
// until the handler resolves. heartbeatInterval must be < visibilityTimeout.
const VISIBILITY_TIMEOUT = Number(process.env.SQS_VISIBILITY_TIMEOUT) || 300;
const HEARTBEAT_INTERVAL = Number(process.env.SQS_HEARTBEAT_INTERVAL) || 60;

// Consumes messages whose body is JSON: { videoId, key } — key is the original's S3 object
// key in the original bucket (sent by the upload service when an upload completes). Which outputs
// get encoded (H.264, AV1) and how is global (src/config/encodingOutputs.js), not configurable per message.
//
// Resolving deletes the message (ack). Throwing leaves it on the queue — SQS makes
// it visible again after the visibility timeout and redelivers it, up to the queue's
// maxReceiveCount before it goes to the dead-letter queue (both configured on the
// queue itself, not here).
//
// The handler records why its message is being acked in deleteNotes; the line is logged
// from the consumer's message_processed event, which fires only after SQS deleted it.
const deleteNotes = new Map(); // MessageId -> "<videoId> <reason>"

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
  log(`${videoId} SQS received: transcode job (original ${originalBytes === null ? 'missing' : formatMb(originalBytes)})`);

  const { job } = await ensureTranscodeJob(videoId, key);

  // Resend a completion for every output already saved: a previous delivery may have encoded
  // it but failed to send, and this is the only chance upload gets to learn the key.
  // Duplicates are harmless (upload just sets the same key again). Only the key is saved in
  // job.outputs, so the size is read back from the uploaded file.
  for (const [codec, outputKey] of Object.entries(job.outputs || {})) {
    const sizeBytes = await getObjectSize(MEDIA_BUCKET, outputKey);
    await sendTranscodeCompleted(videoId, codec, outputKey, sizeBytes);
  }

  if (missingOutputs(job).length === 0) {
    // everything was encoded on a previous delivery (maybe it crashed before marking the job)
    if (job.status !== 'completed') await markTranscodeCompleted(videoId);
    deleteNotes.set(message.MessageId, `${videoId} SQS delete: transcode job skipped, already has all outputs`);
    return; // ack so it isn't redelivered
  }

  try {
    // each output is reported the moment it's saved, so H.264 reaches the feed before AV1 finishes.
    // If a send fails the handler throws, SQS redelivers, and the resend loop above covers it —
    // outputs already saved are not re-encoded.
    const { sourceBytes, encodedBytes } = await runTranscodeJob(videoId, (codec, outputKey, sizeBytes) =>
      sendTranscodeCompleted(videoId, codec, outputKey, sizeBytes)
    );
    const summary = Object.entries(encodedBytes).map(([codec, bytes]) => `${codec} ${formatMb(bytes)}`).join(', ');
    deleteNotes.set(message.MessageId, `${videoId} SQS delete: transcode job processed (original ${formatMb(sourceBytes)} -> ${summary})`);
  } catch (err) {
    // The original is gone from the bucket — retrying can't bring it back, so ack the
    // message instead of letting SQS redeliver it forever. runTranscodeJob has already
    // marked the job 'failed' with this error.
    if (err.name === 'NoSuchKey') {
      logError(`Transcode failed for videoId=${videoId}: original ${key} not found in bucket, giving up`);
      deleteNotes.set(message.MessageId, `${videoId} SQS delete: transcode job given up, original missing`);
      return;
    }
    throw err;
  }
}

export function startTranscodeWorker() {
  if (!TRANSCODE_QUEUE_URL) {
    throw new Error('TRANSCODE_QUEUE_URL not set — the SQS worker is the only way this service receives jobs');
  }
  if (!TRANSCODE_COMPLETED_QUEUE_URL) {
    throw new Error('TRANSCODE_COMPLETED_QUEUE_URL not set — nowhere to report finished encodes to the upload service');
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

  // emitted after the acked message was deleted from the queue
  consumer.on('message_processed', (message) => {
    const note = deleteNotes.get(message.MessageId);
    deleteNotes.delete(message.MessageId);
    if (note) log(note);
  });

  // sqs-consumer wraps the handler's error; the original is on err.cause.
  consumer.on('processing_error', (err, message) => {
    const { videoId } = safeParse(message?.Body);
    logError(`Transcode failed for videoId=${videoId}:`, err.cause?.message ?? err.message);
  });

  // also emitted when deleting an acked message fails — it'll be redelivered, so drop its note
  consumer.on('error', (err, message) => {
    if (message) deleteNotes.delete(message.MessageId);
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
