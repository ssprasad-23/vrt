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
