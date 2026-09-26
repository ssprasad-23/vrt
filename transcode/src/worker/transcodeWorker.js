import { Consumer } from 'sqs-consumer';
import { sqsClient, TRANSCODE_QUEUE_URL } from '../config/sqsConfig.js';
import { ensureTranscodeJob, runTranscodeJob } from '../services/transcodeService.js';

// Lease held on an in-flight message. ffmpeg encodes can run for minutes, so the
// consumer extends it every SQS_HEARTBEAT_INTERVAL seconds (ChangeMessageVisibility)
// until the handler resolves. heartbeatInterval must be < visibilityTimeout.
const VISIBILITY_TIMEOUT = Number(process.env.SQS_VISIBILITY_TIMEOUT) || 300;
const HEARTBEAT_INTERVAL = Number(process.env.SQS_HEARTBEAT_INTERVAL) || 60;

// Consumes messages whose body is JSON: { videoId, url }. Encoding settings are
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

  const { videoId, url } = payload;
  if (!videoId || !url) {
    throw new Error(`Bad transcode message (MessageId=${message.MessageId}): videoId and url are required`);
  }

  const { job, created } = await ensureTranscodeJob(videoId, url);
  if (!created && job.status === 'completed') {
    return; // already encoded on a previous delivery — ack so it isn't redelivered
  }

  await runTranscodeJob(videoId);
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

  consumer.on('message_received', (message) => {
    const { videoId } = safeParse(message.Body);
    console.log(`Transcode message received: videoId=${videoId}`);
  });

  consumer.on('message_processed', (message) => {
    const { videoId } = safeParse(message.Body);
    console.log(`Transcode message processed: videoId=${videoId}`);
  });

  consumer.on('processing_error', (err) => {
    console.error('Transcode message processing error:', err.message);
  });

  consumer.on('error', (err) => {
    console.error('SQS consumer error:', err.message);
  });

  consumer.start();
  console.log(`Transcode worker polling SQS queue ${TRANSCODE_QUEUE_URL}`);
  return consumer;
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
