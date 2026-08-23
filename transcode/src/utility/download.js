import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Downloads a video from a URL (e.g. a presigned S3 GET URL) to a local file so ffmpeg can read it.
export async function downloadToFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download source video: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destPath));
}
