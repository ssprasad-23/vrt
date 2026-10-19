import fs from 'fs/promises';
import path from 'path';
import { spawnFfmpeg } from '../utility/ffmpeg.js';
import { MEDIA_BUCKET, buildFrameKey, uploadFileToS3 } from '../utility/s3.js';

// One frame is picked at a random point inside each window: 0-10s, 10-20s, 20-30s, ...
// for the whole length of the video.
const SEGMENT_SECONDS = 10;

// Seeking to the very last instant can return no frame, so stay this far from the end.
const END_MARGIN_SECONDS = 0.5;

// Picks one random timestamp per 10s window across the whole video, e.g. 60s -> 6,
// 25s -> 3 (the last window is cut short).
function pickFrameTimestamps(duration) {
  const lastUsable = duration - END_MARGIN_SECONDS;
  const timestamps = [];

  for (let start = 0; start < lastUsable; start += SEGMENT_SECONDS) {
    const end = Math.min(start + SEGMENT_SECONDS, lastUsable);
    timestamps.push(start + Math.random() * (end - start));
  }

  return timestamps;
}

// Extracts one JPEG per timestamp into outputDir as frame_1.jpg, frame_2.jpg, ...
// Resolves with [{ index, timestamp, path }] in order.
async function extractFrames(inputPath, outputDir, timestamps) {
  const frames = [];

  for (const [i, timestamp] of timestamps.entries()) {
    const index = i + 1;
    const framePath = path.join(outputDir, `frame_${index}.jpg`);

    // -ss before -i seeks fast; ffmpeg still decodes up to the exact timestamp.
    await spawnFfmpeg(['-y', '-ss', timestamp.toFixed(3), '-i', inputPath, '-frames:v', '1', '-q:v', '2', framePath]);

    // ffmpeg can exit 0 without writing anything if the seek lands past the last frame.
    await fs.access(framePath).catch(() => {
      throw new Error(`Frame ${index} at ${timestamp.toFixed(3)}s was not written`);
    });

    frames.push({ index, timestamp, path: framePath });
  }

  return frames;
}

// Extracts one random frame per 10s window of the source and uploads each to the media
// bucket as {videoId}/frames/{videoId}_frame001.jpg. Scratch JPEGs go in jobDir, which the
// caller cleans up.
export async function extractAndUploadFrames(videoId, inputPath, jobDir, duration) {
  const frames = await extractFrames(inputPath, jobDir, pickFrameTimestamps(duration));
  for (const frame of frames) {
    await uploadFileToS3(MEDIA_BUCKET, buildFrameKey(videoId, frame.index), frame.path, 'image/jpeg');
  }
}
