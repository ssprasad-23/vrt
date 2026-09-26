import fs from 'fs';
import { Upload } from '@aws-sdk/lib-storage';
import { s3Client } from '../config/s3Config.js';

// Everything this service produces (AV1 output + frames) goes in one public-facing
// "media" bucket, laid out as {videoId}/<file>. The upload service's source files
// live in a separate, private "original" bucket.
export const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET_NAME || 'media';

// Object key for a video's AV1-encoded output within MEDIA_BUCKET.
export function buildAv1EncodedKey(videoId, container) {
  return `${videoId}/av1.${container}`;
}

// Object key for one extracted frame within MEDIA_BUCKET (index is 1-based).
export function buildFrameKey(videoId, index) {
  return `${videoId}/frames/frame_${index}.jpg`;
}

// Streams a local file (ffmpeg output or an extracted frame) up to a bucket without
// buffering it fully in memory.
export async function uploadFileToS3(bucket, key, filePath, contentType) {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
  });

  await upload.done();
  return key;
}
