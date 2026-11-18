import apiClient from './client';

// Your own uploads, newest first (GET /videos → upload service).
export const fetchMyVideos = async () => {
  const res = await apiClient.get('/videos');
  return res.data.data.videos; // [{ videoId, description, category, status, failureReason, createdAt, h264Key, thumbnailKey }]
};

// DELETE /videos/:id — removes the video and its files. 409 while it's still processing,
// 404 if it's already gone.
export const deleteVideo = async videoId => {
  const res = await apiClient.delete(`/videos/${videoId}`);
  return res.data.data; // { videoId }
};

// POST /videos/:id/report — reason is 'sexual', 'child_safety' or 'hate_harassment_violence'.
// Only records the report; the video stays in the feed. Reporting it again succeeds too.
// 400 for your own video, 404 if it's gone.
export const reportVideo = async (videoId, reason) => {
  const res = await apiClient.post(`/videos/${videoId}/report`, {reason});
  return res.data.data; // { videoId }
};
