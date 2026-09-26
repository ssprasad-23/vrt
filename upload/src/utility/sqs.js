import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient, TRANSCODE_QUEUE_URL } from '../config/sqsConfig.js';
import { log } from './logger.js';

// Queues a transcode job for an uploaded video. Message body is { videoId, key } — key is
// the original's S3 object key; the transcode worker downloads it from the original bucket itself.
export async function sendTranscodeJob(videoId, key) {
  if (!TRANSCODE_QUEUE_URL) {
    throw new Error('TRANSCODE_QUEUE_URL not set — cannot queue transcode job');
  }

  const command = new SendMessageCommand({
    QueueUrl: TRANSCODE_QUEUE_URL,
    MessageBody: JSON.stringify({ videoId, key }),
  });

  const result = await sqsClient.send(command);
  log(`Transcode job queued for video ${videoId} (MessageId=${result.MessageId})`);
  return result.MessageId;
}
