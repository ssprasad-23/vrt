// H.264 encoding settings applied to every transcode job, global — change values here
// to change how ALL jobs (past config aside) are encoded going forward.
// H.264 + AAC plays on every device (every iPhone, Android, the iOS Simulator, browsers),
// so this is the output the feed serves. Encoded from the original, before AV1.
export const H264_SETTINGS = {
  name: 'h264',
  videoCodec: 'libx264',
  crf: 23,
  bitrate: null,
  preset: 'medium',
  profile: 'high',
  resolution: null,
  frameRate: 30,
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioBitrate: '128k',
  container: 'mp4' };

// name: key for this output in transcode_jobs.outputs and the `codec` in completion messages — keep it 'h264'
// videoCodec: libx264 (software, best quality per bit). h264_videotoolbox (Mac hardware) is faster but lower quality.
// crf: 0-51, LOWER = higher quality/BIGGER file. 18 is near-lossless, 23 is the usual default, 28 is small.
//   Ignored if bitrate is set (bitrate forces a rate-controlled encode instead of constant quality).
// bitrate: e.g. '4M' for a 4 Mbps target. Leave null to encode at constant quality (crf) instead.
// preset: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow —
//   slower = smaller file at the same quality, but a longer encode.
// profile: high is supported by every modern phone; main/baseline only for very old devices.
// resolution: e.g. '1920x1080' or '1280x720'. Leave null to keep the source resolution.
// frameRate: maximum frame rate, e.g. 30 — faster sources (60fps) are reduced, slower ones (24/25fps) kept as-is.
//   Leave null to always keep the source frame rate.
// pixelFormat: must stay 8-bit yuv420p — phones can't hardware-decode 10-bit H.264, so it wouldn't play.
// audioCodec: aac — plays on every device.
// container: output container extension
