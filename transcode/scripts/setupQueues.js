// Attaches a dead-letter queue to both transcode queues (creating the DLQs if needed). Safe to re-run.
// Works against ElasticMQ locally (SQS_ENDPOINT) and real AWS SQS.
//
//   node scripts/setupQueues.js
//
// The worker already gives up on a video after TRANSCODE_MAX_ATTEMPTS (default 3) and reports it
// as failed, so MAX_RECEIVE_COUNT is deliberately higher: the DLQ only catches messages the
// handlers can't process at all (malformed bodies, a worker that crashes on every delivery).
// Check a DLQ's depth to spot those, then inspect/replay its messages by hand.
import 'dotenv/config';
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { sqsClient, TRANSCODE_QUEUE_URL, TRANSCODE_COMPLETED_QUEUE_URL } from '../src/config/sqsConfig.js';

const MAX_RECEIVE_COUNT = 5;
// keep failed messages around long enough to look at them (14 days is the SQS maximum)
const DLQ_RETENTION_SECONDS = 14 * 24 * 60 * 60;

for (const queueUrl of [TRANSCODE_QUEUE_URL, TRANSCODE_COMPLETED_QUEUE_URL]) {
  if (!queueUrl) {
    console.error('TRANSCODE_QUEUE_URL and TRANSCODE_COMPLETED_QUEUE_URL must both be set');
    process.exit(1);
  }

  const dlqName = `${queueUrl.split('/').pop()}-dlq`;
  const { QueueUrl: dlqUrl } = await sqsClient.send(new CreateQueueCommand({
    QueueName: dlqName,
    Attributes: { MessageRetentionPeriod: String(DLQ_RETENTION_SECONDS) },
  }));
  const { Attributes } = await sqsClient.send(new GetQueueAttributesCommand({
    QueueUrl: dlqUrl,
    AttributeNames: ['QueueArn'],
  }));

  await sqsClient.send(new SetQueueAttributesCommand({
    QueueUrl: queueUrl,
    Attributes: {
      RedrivePolicy: JSON.stringify({ deadLetterTargetArn: Attributes.QueueArn, maxReceiveCount: MAX_RECEIVE_COUNT }),
    },
  }));
  console.log(`${queueUrl.split('/').pop()} -> ${dlqName} (after ${MAX_RECEIVE_COUNT} receives)`);
}
