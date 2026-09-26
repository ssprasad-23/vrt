import fs from 'fs';
import { pipeline } from 'stream/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3Config.js';

// Downloads an object from S3 (the original upload) to a local file so ffmpeg can read it.
// Uses this service's own credentials, so unlike a presigned URL it never expires on retries.
export async function downloadFromS3(bucket, key, destPath) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(response.Body, fs.createWriteStream(destPath));
}
