import {Platform} from 'react-native';
import {MEDIA_URL_IOS, MEDIA_URL_ANDROID} from '@env';
import {videoClient} from './client';

const MEDIA_BASE_URL = Platform.OS === 'ios' ? MEDIA_URL_IOS : MEDIA_URL_ANDROID;

export const FEED_PAGE_SIZE = 3;

// Playable URL for a transcoded video's key in the public media bucket.
export const mediaUrl = key => `${MEDIA_BASE_URL}/${key}`;

// One page of the feed via the gateway (GET /feed → feed service).
// Pass the previous page's nextCursor to get the next one; nextCursor is null at the end.
export const fetchFeed = async (cursor = null) => {
  const res = await videoClient.get('/feed', {
    params: {limit: FEED_PAGE_SIZE, ...(cursor ? {cursor} : {})},
  });
  return res.data.data; // { videos, nextCursor }
};

// Maps a feed API video into the shape the Post component renders.
export const toPost = video => ({
  id: video.videoId,
  videoUri: mediaUrl(video.videoKey),
  description: video.description,
  category: video.category,
  user: {id: video.userId, username: `user${video.userId}`},
  likes: 0,
  dislikes: 0,
});
