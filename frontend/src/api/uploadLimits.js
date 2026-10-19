// Mirrors the server's limits (upload/src/config/uploadLimits.js) so an over-limit video is
// turned away before it's uploaded. The server still enforces them.
export const MAX_UPLOAD_MB = 500;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;
