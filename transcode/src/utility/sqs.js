import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient, TRANSCODE_COMPLETED_QUEUE_URL } from '../config/sqsConfig.js';
import { log } from './logger.js';

// Tells the upload service one of a video's outputs finished encoding — sent once per output
// (H.264 first, then AV1). Message body is { videoId, codec, outputKey, sizeMb }: codec is the
// output's name from its encoding config ('h264' / 'av1'), outputKey the encoded file's key in the
// media bucket, sizeMb its size in MB with 1 decimal (e.g. 16.2).
export async function sendTranscodeCompleted(videoId, codec, outputKey, sizeBytes) {
  const sizeMb = sizeBytes == null ? null : Number((sizeBytes / (1024 * 1024)).toFixed(1));
  const command = new SendMessageCommand({
    QueueUrl: TRANSCODE_COMPLETED_QUEUE_URL,
    MessageBody: JSON.stringify({ videoId, codec, outputKey, sizeMb }),
  });

  const result = await sqsClient.send(command);
  log(`${videoId} SQS sent: ${codec} completion${sizeMb == null ? '' : ` (${sizeMb}MB)`}`);
  return result.MessageId;
}
