// Turns a failed request into something to show the user: the server's own message when it sent
// one (e.g. "Invalid username or password", "Username is already taken"), otherwise a plain
// explanation instead of axios's "Request failed with status code 401".
export const getErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  const serverMessage = err?.response?.data?.message;
  if (typeof serverMessage === 'string' && serverMessage) return serverMessage;
  if (err?.response) return fallback; // server answered but without a usable message
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (err?.request || err?.message === 'Network Error') {
    return "Can't reach the server. Check your connection and try again.";
  }
  return err?.message || fallback;
};
