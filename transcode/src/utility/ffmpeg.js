import { spawn } from 'child_process';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// Builds the ffmpeg CLI args for one encode output (H.264 or AV1) from its settings
// object (see src/config/h264EncodingConfig.js / av1EncodingConfig.js for the knobs).
export function buildEncodeArgs(inputPath, outputPath, settings) {
  const args = ['-y', '-i', inputPath, '-c:v', settings.videoCodec];

  if (settings.videoCodec === 'libx264') {
    args.push('-preset', String(settings.preset));
    if (settings.profile) args.push('-profile:v', settings.profile);
  } else if (settings.videoCodec === 'libsvtav1') {
    args.push('-preset', String(settings.preset));
  } else if (settings.videoCodec === 'libaom-av1') {
    args.push('-cpu-used', String(settings.cpuUsed), '-row-mt', '1');
  }

  if (settings.bitrate) {
    args.push('-b:v', settings.bitrate);
  } else if (settings.videoCodec === 'libx264') {
    args.push('-crf', String(settings.crf));
  } else {
    // AV1 encoders need -b:v 0 alongside -crf to run in pure constant-quality mode
    args.push('-crf', String(settings.crf), '-b:v', '0');
  }

  if (settings.resolution) {
    const [width, height] = settings.resolution.split('x');
    args.push('-vf', `scale=${width}:${height}`);
  }

  if (settings.frameRate) {
    args.push('-fpsmax', String(settings.frameRate)); // cap only; never adds frames to slower sources
  }

  args.push(
    '-pix_fmt', settings.pixelFormat,
    '-c:a', settings.audioCodec,
    '-b:a', settings.audioBitrate,
  );

  // moves the mp4 index to the front so players can start before the whole file downloads
  if (settings.container === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  args.push(outputPath);
  return args;
}

// Runs one encode and resolves once it finishes, rejecting with stderr output on failure.
export function runFfmpeg(inputPath, outputPath, settings) {
  return spawnFfmpeg(buildEncodeArgs(inputPath, outputPath, settings));
}

// Runs ffmpeg with an arbitrary arg list (shared by the encode and frame extraction).
export function spawnFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg (is it installed and on PATH?): ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}
