import { S3Client } from '@aws-sdk/client-s3';

// S3 client for the output bucket. Works against any S3-compatible store — MinIO
// locally (S3_ENDPOINT=http://localhost:9000), Cloudflare R2 later
// (S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com, AWS_REGION=auto).
export const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // required for MinIO (no virtual-hosted-style addressing); also works on R2
});
