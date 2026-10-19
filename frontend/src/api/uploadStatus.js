import {Alert} from 'react-native';
import apiClient, {isSessionRejected} from './client';
import {getErrorMessage} from './errors';

// After an upload, the video is transcoded in the background (a minute or two). This polls
// GET /videos/:id until it's ready or failed and tells the user either way — from whatever screen
// they're on, since the Upload screen has usually been closed by then. Tracking lives in memory,
// so it stops if the app is killed; the video still goes live, the user just isn't told.
const POLL_INTERVAL_MS = 5000;
const GIVE_UP_AFTER_MS = 20 * 60 * 1000;

const tracked = new Set();

export const trackUpload = videoId => {
  if (tracked.has(videoId)) return;
  tracked.add(videoId);
  const startedAt = Date.now();

  const stop = () => tracked.delete(videoId);

  const poll = async () => {
    if (!tracked.has(videoId)) return;
    try {
      const res = await apiClient.get(`/videos/${videoId}`);
      const {status, failureReason} = res.data.data;
      if (status === 'ready') {
        stop();
        Alert.alert('Your video is live', 'It now appears in the feed.');
        return;
      }
      if (status === 'failed') {
        stop();
        Alert.alert(
          "Your video couldn't be posted",
          failureReason || 'Video could not be processed',
        );
        return;
      }
    } catch (err) {
      // logged out / session expired: nobody to tell
      if (isSessionRejected(err) || err?.response?.status === 404) {
        stop();
        return;
      }
      console.log('Upload status check failed, will retry:', getErrorMessage(err));
    }
    if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
      stop();
      return;
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  setTimeout(poll, POLL_INTERVAL_MS);
};

// Logging out should stop telling the previous user about their uploads.
export const stopTrackingUploads = () => tracked.clear();
