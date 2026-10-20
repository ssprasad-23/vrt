import axios from 'axios';
import {Platform} from 'react-native';
import {API_URL_IOS, API_URL_ANDROID} from '@env';
import {getAccessToken, setAccessTokenExternal} from '../context/AuthContext';

// Every backend call goes through the API gateway, which routes by path prefix:
// /auth/* -> auth, /videos/* -> upload, /feed -> feed.
const API_BASE_URL = Platform.OS === 'ios' ? API_URL_IOS : API_URL_ANDROID;

// Endpoints that must never trigger a refresh-and-retry (they either don't
// need an access token or are the refresh call itself).
const AUTH_EXEMPT_PATHS = [
  '/auth/refreshToken',
  '/auth/userLogin',
  '/auth/userSignUp',
  '/auth/logout',
  '/auth/forgotPassword',
  '/auth/verifyResetCode',
  '/auth/resetPassword',
];

let refreshPromise = null;

// Called when the session is really over (the refresh token was rejected), so the app can send
// the user back to LoginPage. App.jsx registers it; it lives here because the interceptor below
// runs outside React and has no navigation of its own.
let onSessionExpired = () => {};
export const setSessionExpiredHandler = handler => {
  onSessionExpired = handler;
};

// True when auth rejected the refresh token itself (expired, revoked, reused, missing) — as
// opposed to a network error or a server crash, which shouldn't log the user out.
export const isSessionRejected = err =>
  err?.response?.status === 401 || err?.response?.status === 403;

// Calls /auth/refreshToken (the OS sends the httpOnly refresh cookie, and the response
// rotates it), stores the new access token, and returns it. Concurrent 401/403s share one
// in-flight refresh instead of each firing their own — which also matters because refresh
// tokens are single-use: a second parallel call with the same cookie would count as reuse
// and revoke the session. Also used by App.jsx on launch to log in automatically.
export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refreshToken`, null, {
        withCredentials: true,
        timeout: 10000,
      })
      .then(res => {
        const newToken = res.data.data.accessToken;
        setAccessTokenExternal(newToken);
        console.log('Access token refreshed');
        return newToken;
      })
      .catch(err => {
        if (isSessionRejected(err)) {
          setAccessTokenExternal(null);
        }
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const createClient = () => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    withCredentials: true,
  });

  // Never log the token itself — anything in the console can end up in crash reports and logs.
  client.interceptors.request.use(config => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    response => response,
    async error => {
      const {config, response} = error;
      const status = response?.status;
      const isExempt = AUTH_EXEMPT_PATHS.some(path => config?.url?.includes(path));

      if ((status === 401 || status === 403) && !isExempt && !config._retry) {
        config._retry = true;
        try {
          const newToken = await refreshAccessToken();
          config.headers.Authorization = `Bearer ${newToken}`;
          return client(config);
        } catch (refreshErr) {
          // refresh token rejected: the session is over, back to login. A network error
          // just fails this request; the user stays put and can retry.
          if (isSessionRejected(refreshErr)) onSessionExpired();
          return Promise.reject(refreshErr);
        }
      }
      return Promise.reject(error);
    },
  );

  return client;
};

const apiClient = createClient();

export default apiClient;
