import fs from 'fs';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3Client } from '../config/s3Config.js';

// Everything this service produces (H.264 + AV1 outputs, frames) goes in one public-facing
// "media" bucket, laid out as {videoId}/<file>. The upload service's source files
// live in a separate, private "original" bucket.
export const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET_NAME || 'media';

// The upload service's private bucket, where source videos are read from.
export const ORIGINAL_BUCKET = process.env.S3_BUCKET_NAME;

// Short codec label used in output filenames, keyed by ffmpeg encoder name.
const CODEC_LABELS = {
  libx264: 'H264',
  libsvtav1: 'AV1',
  'libaom-av1': 'AV1',
};

// Object key for a video's encoded output within MEDIA_BUCKET, e.g.
// {videoId}/{videoId}_H264_1080_5.1MB.mp4 or {videoId}/{videoId}_AV1_1080_2.0MB.mp4
// Quality is the shorter side, so portrait 1080x1920 is also 1080.
export function buildEncodedKey(videoId, { videoCodec, width, height, sizeBytes, container }) {
  const codec = CODEC_LABELS[videoCodec] || videoCodec;
  const quality = String(Math.min(width, height));
  const sizeMb = `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${videoId}/${videoId}_${codec}_${quality}_${sizeMb}.${container}`;
}

// Object key for one extracted frame within MEDIA_BUCKET (index is 1-based), e.g.
// {videoId}/frames/{videoId}_frame001.jpg
export function buildFrameKey(videoId, index) {
  return `${videoId}/frames/${videoId}_frame${String(index).padStart(3, '0')}.jpg`;
}

// Size in bytes of an object, or null if it doesn't exist (HeadObject reports a missing
// key as 'NotFound', not 'NoSuchKey' like GetObject does).
export async function getObjectSize(bucket, key) {
  try {
    const response = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return response.ContentLength;
  } catch (err) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
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
