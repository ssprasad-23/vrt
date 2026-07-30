import axios from 'axios';
import {Platform} from 'react-native';
import {
  AUTH_API_URL_IOS,
  AUTH_API_URL_ANDROID,
  VIDEO_API_URL_IOS,
  VIDEO_API_URL_ANDROID,
} from '@env';
import {getAccessToken, setAccessTokenExternal} from '../context/AuthContext';

const AUTH_BASE_URL =
  Platform.OS === 'ios' ? AUTH_API_URL_IOS : AUTH_API_URL_ANDROID;
const VIDEO_BASE_URL =
  Platform.OS === 'ios' ? VIDEO_API_URL_IOS : VIDEO_API_URL_ANDROID;

// Endpoints that must never trigger a refresh-and-retry (they either don't
// need an access token or are the refresh call itself).
const AUTH_EXEMPT_PATHS = ['/refreshToken', '/userLogin', '/userSignUp', '/logout'];

let refreshPromise = null;

// Calls the auth service's /refreshToken (sends the httpOnly refresh cookie),
// stores the new access token, and returns it. Concurrent 401/403s share one
// in-flight refresh instead of each firing their own.
const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${AUTH_BASE_URL}/refreshToken`, null, {withCredentials: true})
      .then(res => {
        const newToken = res.data.data.accessToken;
        setAccessTokenExternal(newToken);
        console.log('access token refreshed');
        return newToken;
      })
      .catch(err => {
        setAccessTokenExternal(null);
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const createClient = baseURL => {
  const client = axios.create({
    baseURL,
    timeout: 10000,
    withCredentials: true,
  });

  client.interceptors.request.use(config => {
    const token = getAccessToken();
    const timestamp = new Date().toLocaleTimeString();
    if (token) {
      console.log(
        `[${timestamp}] token sent for ${config.baseURL}${config.url}`,
        token,
      );
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.log(
        `[${timestamp}] token not sent for ${config.baseURL}${config.url} - no token in AuthContext`,
      );
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
          return Promise.reject(refreshErr);
        }
      }
      return Promise.reject(error);
    },
  );

  return client;
};

const apiClient = createClient(AUTH_BASE_URL);
export const videoClient = createClient(VIDEO_BASE_URL);

export default apiClient;
