import { H264_SETTINGS } from './h264EncodingConfig.js';
import { AV1_SETTINGS } from './av1EncodingConfig.js';

// Every output a video is encoded to, each straight from the original. Array order is the
// encode order: H.264 first, since it's fast and what the feed plays, then the slower AV1.
// Add or remove an output here; the rest of the service only imports this list.
export const ENCODING_OUTPUTS = [H264_SETTINGS, AV1_SETTINGS];
