// Mirrors the server's limits (upload/src/config/uploadLimits.js) so an over-limit video is
// turned away before it's uploaded. The server still enforces them.
export const MAX_UPLOAD_MB = 500;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;
// Videos must be one of these sizes, [short side, long side], in either orientation
// (e.g. 720x1280 or 1280x720). Unlike the limits above, the server doesn't check this.
export const ALLOWED_VIDEO_SIZES = [
  [720, 1280],
  [1080, 1920],
];
