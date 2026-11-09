import apiClient from './client';

// Set when someone is unblocked, so Home reloads the feed (their videos come back) next time
// it's on screen. Read and cleared with takeFeedStale().
let feedStale = false;

// Blocks a user via the gateway (POST /blocks/:userId → feed service). Blocking someone
// already blocked succeeds too. The feed then hides their videos (one-way: they still see yours).
export const blockUser = async userId => {
  const res = await apiClient.post(`/blocks/${userId}`);
  return res.data.data; // { blockedUserId }
};

// The users you've blocked, newest first (GET /blocks).
export const fetchBlockedUsers = async () => {
  const res = await apiClient.get('/blocks');
  return res.data.data.blockedUsers; // [{ userId, blockedAt }]
};

// DELETE /blocks/:userId — 404 if they weren't blocked.
export const unblockUser = async userId => {
  const res = await apiClient.delete(`/blocks/${userId}`);
  feedStale = true;
  return res.data.data; // { blockedUserId }
};

// True once after any unblock since the last call.
export const takeFeedStale = () => {
  const stale = feedStale;
  feedStale = false;
  return stale;
};
