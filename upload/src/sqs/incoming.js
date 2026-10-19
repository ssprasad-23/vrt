import { Consumer } from 'sqs-consumer';
import { sqsClient, TRANSCODE_COMPLETED_QUEUE_URL } from '../config/sqsConfig.js';
import { setEncodedKey, markVideoFailed, ENCODED_KEY_COLUMNS } from '../models/videoModels.js';
import { log, logError } from '../utility/logger.js';

// Consumes { videoId, status: 'failed', reason } when a video can't be encoded, and
// { videoId, codec, outputKey, sizeMb } messages sent by the transcode service each time
// one of a video's outputs finishes (H.264 first, then AV1), and saves outputKey and sizeMb in that
// codec's columns (h264_s3_key + h264_size_mb / av1_s3_key + av1_size_mb). Resolving acks the message; throwing leaves it on the queue for
// SQS to redeliver. Setting the same key twice is harmless, so duplicate messages are fine.
async function processMessage(message) {
  let payload;
  try {
    payload = JSON.parse(message.Body);
  } catch {
    throw new Error(`Bad transcode completion message (MessageId=${message.MessageId}): body is not valid JSON`);
  }

  // { videoId, status: 'failed', reason } — the transcode service gave up on this video
  // (too long, unreadable file, or out of retries). reason is meant for the user.
  if (payload.status === 'failed') {
    if (!payload.videoId) {
      throw new Error(`Bad transcode failure message (MessageId=${message.MessageId}): videoId is required`);
    }
    const failed = await markVideoFailed(payload.videoId, payload.reason || 'Video could not be processed');
    log(`${payload.videoId} SQS received: transcode failed${failed ? '' : ' (already ready/failed, ignored)'} — ${payload.reason}`);
    return;
  }

  // messages sent before H.264 was added have no codec — they were always AV1;
  // ones sent before sizes were added have no sizeMb
  const { videoId, outputKey, codec = 'av1', sizeMb = null } = payload;
  if (!videoId || !outputKey) {
    throw new Error(`Bad transcode completion message (MessageId=${message.MessageId}): videoId and outputKey are required`);
  }
  if (!ENCODED_KEY_COLUMNS[codec]) {
    // no column for it — retrying won't add one, so ack and move on
    logError(`Transcode completion for unknown codec=${codec} (videoId=${videoId}), ignoring`);
    return;
  }

  const video = await setEncodedKey(videoId, codec, outputKey, sizeMb);
  if (!video) {
    // no such video row — retrying won't create it, so ack and move on
    logError(`Transcode completion for unknown videoId=${videoId}, ignoring`);
    return;
  }
  log(`${videoId} SQS received: ${codec} completion (${sizeMb}MB)`);
}

export function startTranscodeCompletedConsumer() {
  if (!TRANSCODE_COMPLETED_QUEUE_URL) {
    throw new Error('TRANSCODE_COMPLETED_QUEUE_URL not set — cannot receive finished encodes from the transcode service');
  }

  const consumer = Consumer.create({
    queueUrl: TRANSCODE_COMPLETED_QUEUE_URL,
    sqs: sqsClient,
    handleMessage: processMessage,
    waitTimeSeconds: 20, // long polling
  });

  consumer.on('processing_error', (err) => {
    logError('Transcode completion processing error:', err.cause?.message ?? err.message);
  });

  consumer.on('error', (err) => {
    logError('SQS consumer error:', err.message);
  });

  consumer.start();
  log(`Listening for finished encodes on SQS queue ${TRANSCODE_COMPLETED_QUEUE_URL}`);
  return consumer;
}
