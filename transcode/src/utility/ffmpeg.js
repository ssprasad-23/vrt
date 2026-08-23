import { spawn } from 'child_process';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// Builds the ffmpeg CLI args for an AV1 encode from a merged settings object
// (see src/config/encodingConfig.js for the available knobs).
export function buildAv1Args(inputPath, outputPath, settings) {
  const args = ['-y', '-i', inputPath, '-c:v', settings.videoCodec];

  if (settings.videoCodec === 'libsvtav1') {
    args.push('-preset', String(settings.preset));
  } else if (settings.videoCodec === 'libaom-av1') {
    args.push('-cpu-used', String(settings.cpuUsed), '-row-mt', '1');
  }

  if (settings.bitrate) {
    args.push('-b:v', settings.bitrate);
  } else {
    args.push('-crf', String(settings.crf), '-b:v', '0');
  }

  if (settings.resolution) {
    const [width, height] = settings.resolution.split('x');
    args.push('-vf', `scale=${width}:${height}`);
  }

  if (settings.frameRate) {
    args.push('-r', String(settings.frameRate));
  }

  args.push(
    '-pix_fmt', settings.pixelFormat,
    '-c:a', settings.audioCodec,
    '-b:a', settings.audioBitrate,
    outputPath
  );

  return args;
}

// Runs ffmpeg and resolves once the encode finishes, rejecting with stderr output on failure.
export function runFfmpeg(inputPath, outputPath, settings) {
  return new Promise((resolve, reject) => {
    const args = buildAv1Args(inputPath, outputPath, settings);
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
