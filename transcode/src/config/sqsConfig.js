import { SQSClient } from '@aws-sdk/client-sqs';

// SQS client for the transcode queue. Reuses the same AWS region/credentials as S3
// (src/utility/s3.js). For local dev against LocalStack or ElasticMQ, set SQS_ENDPOINT
// (e.g. http://localhost:4566) — leave it unset to hit real AWS SQS.
export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.SQS_ENDPOINT || undefined,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Full queue URL, e.g. https://sqs.us-east-1.amazonaws.com/123456789012/av1-transcode
// The worker doesn't start without it.
export const TRANSCODE_QUEUE_URL = process.env.TRANSCODE_QUEUE_URL;
