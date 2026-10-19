// Upload limits. The app checks these before uploading (frontend/src/api/uploadLimits.js mirrors
// them), but the server is the real gate: /complete rejects an oversized file, and the transcode
// service rejects anything longer than its MAX_VIDEO_DURATION_SECONDS (also 60).
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 500;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;
