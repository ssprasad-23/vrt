import fs from 'fs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, // MinIO: e.g. http://localhost:9000
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // required for MinIO — it doesn't support virtual-hosted-style addressing
});

const DOWNLOAD_URL_EXPIRY_SECONDS = Number(process.env.DOWNLOAD_URL_EXPIRY_SECONDS) || 900; // 15 min

// Builds the S3 object key for an AV1-encoded output, mirroring the upload service's
// original/{userId}/{videoId}-{filename} convention but under its own top-level folder.
export function buildAv1EncodedKey(videoId, container) {
  return `av1-encoded/${videoId}.${container}`;
}

// Streams a local file (the ffmpeg output) up to S3 without buffering it fully in memory.
export async function uploadFileToS3(key, filePath, contentType) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
  });

  await upload.done();
  return key;
}

// Generates a pre-signed GET URL so a client can retrieve the transcoded output
// without exposing AWS credentials or routing the file through this server.
export async function generateDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS });
}
