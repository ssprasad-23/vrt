import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient, TRANSCODE_COMPLETED_QUEUE_URL } from '../config/sqsConfig.js';
import { log } from './logger.js';

// Tells the upload service one of a video's outputs finished encoding — sent once per output
// (H.264 first, then AV1). Message body is { videoId, codec, outputKey }: codec is the output's
// name from its encoding config ('h264' / 'av1'), outputKey the encoded file's key in the media bucket.
export async function sendTranscodeCompleted(videoId, codec, outputKey) {
  const command = new SendMessageCommand({
    QueueUrl: TRANSCODE_COMPLETED_QUEUE_URL,
    MessageBody: JSON.stringify({ videoId, codec, outputKey }),
  });

  const result = await sqsClient.send(command);
  log(`Transcode completion sent for video ${videoId} ${codec} (MessageId=${result.MessageId})`);
  return result.MessageId;
}
