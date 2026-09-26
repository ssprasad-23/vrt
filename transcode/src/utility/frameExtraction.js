import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { spawnFfmpeg } from './ffmpeg.js';

const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

// Only videos up to 120s are supported for now. Containers often report a hair over
// the nominal length (e.g. 120.02s), so allow a small tolerance before rejecting.
export const MAX_VIDEO_DURATION_SECONDS = 120;
const DURATION_TOLERANCE_SECONDS = 1;

// One frame is picked at a random point inside each window: 0-10s, 10-20s, 20-30s, ...
// for the whole length of the video.
const SEGMENT_SECONDS = 10;

// Seeking to the very last instant can return no frame, so stay this far from the end.
const END_MARGIN_SECONDS = 0.5;

// Runs ffprobe and resolves with its stdout, rejecting with stderr on a non-zero exit.
function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_PATH, args);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffprobe (is it installed and on PATH?): ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

// Returns the source video's duration in seconds, via ffprobe.
export async function probeDuration(inputPath) {
  const stdout = await runFfprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath]);
  const duration = parseFloat(stdout);
  if (!Number.isFinite(duration)) {
    throw new Error(`ffprobe could not read video duration: ${stdout.slice(-2000)}`);
  }
  return duration;
}

// Returns { width, height } of the first video stream, via ffprobe.
export async function probeDimensions(inputPath) {
  const stdout = await runFfprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', inputPath]);
  const [width, height] = stdout.trim().split('x').map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`ffprobe could not read video dimensions: ${stdout.slice(-2000)}`);
  }
  return { width, height };
}

// Throws if the video is longer than the supported maximum.
export function assertSupportedDuration(duration) {
  if (duration > MAX_VIDEO_DURATION_SECONDS + DURATION_TOLERANCE_SECONDS) {
    throw new Error(`Video is ${duration.toFixed(1)}s long; only videos up to ${MAX_VIDEO_DURATION_SECONDS}s are supported`);
  }
}

// Picks one random timestamp per 10s window across the whole video, e.g. 120s -> 12,
// 60s -> 6, 25s -> 3 (the last window is cut short).
export function pickFrameTimestamps(duration) {
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
export async function extractFrames(inputPath, outputDir, timestamps) {
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
