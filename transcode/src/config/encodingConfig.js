// AV1 encoding settings applied to every transcode job, global — change values here
// to change how ALL jobs (past config aside) are encoded going forward.
export const DEFAULT_ENCODING_SETTINGS = { 
  videoCodec: 'libsvtav1', 
  crf: 30, bitrate: null, 
  preset: 8, 
  cpuUsed: 4, 
  resolution: null, 
  frameRate: null, 
  pixelFormat: 'yuv420p10le', 
  audioCodec: 'libopus', 
  audioBitrate: '128k', 
  container: 'mp4' };
  
// videoCodec: libsvtav1 (fast, recommended) or libaom-av1 (reference encoder, much slower)
// crf: 0-63, lower = higher quality/bigger file. Ignored if bitrate is set (bitrate forces a rate-controlled encode instead of constant quality).
// bitrate: e.g. '2M' for a 2 Mbps target. Leave null to encode at constant quality (crf) instead.
// preset: libsvtav1 speed preset, 0 (slowest/best) - 13 (fastest/worst). Ignored for libaom-av1 (uses `cpuUsed` instead).
// cpuUsed: libaom-av1 speed/quality tradeoff, 0 (slowest/best) - 8 (fastest/worst). Ignored for libsvtav1.
// resolution: e.g. '1920x1080' or '1280x720'. Leave null to keep the source resolution.
// frameRate: e.g. 30. Leave null to keep the source frame rate.
// pixelFormat: 10-bit 4:2:0, standard for AV1
// container: output container extension
