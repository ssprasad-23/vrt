# VRT app (React Native)

The mobile app for VRT: a dark, TikTok-style vertical feed of short gaming clips, with login, signup, password reset and video upload. It's a React Native 0.76 app using the community CLI (not Expo), styled with NativeWind (Tailwind) and some `StyleSheet` files.

It talks to the backend only through the API gateway (`../gateway`), plus the MinIO/S3 bucket directly to upload files and play videos. See the [top-level README](../README.md) for the whole system.

## Screens

| Screen | File | What it does |
|---|---|---|
| Login | `src/screens/loginPage.js` | Username + password. Links to Sign Up and Forgot password. |
| Sign Up | `src/screens/signupPage.js` | Creates an account (username, email, password, date of birth, phone, country). |
| Forgot password | `src/screens/forgotPasswordPage.js` | Sends a 6-digit code to the user's email. |
| Enter code | `src/screens/verifyCodePage.js` | Checks the code (with "Resend code"). A correct code gets a one-time reset token. |
| New password | `src/screens/newPasswordPage.js` | New password + confirm, then back to Login. |
| Home (feed) | `src/screens/home.js` | Vertically snapping video feed with paging and pull-to-refresh. Only the video on screen plays. Menu: Upload, Log Out. |
| Upload | `src/screens/uploadPage.js` | Pick a video (≤ 500 MB, ≤ 60s), add a description and category, upload, then get told when it's ready or why it failed. |

On launch the app tries a silent token refresh, so a user with a saved session goes straight to Home.

## Run it

You need the React Native toolchain ([environment setup](https://reactnative.dev/docs/set-up-your-environment)): Xcode and CocoaPods for iOS, Android Studio for Android. The backend services should be running too (see the top-level README).

```bash
npm install
cd ios && pod install && cd ..   # iOS only, after installing or changing native deps

npm start          # Metro bundler, in its own terminal
npm run ios        # build and run on the iOS Simulator
npm run android    # build and run on an Android emulator
```

From the repo root, `npm run dev` starts all the backend services and the iOS app together.

### Configuration

Create `frontend/.env` (gitignored, loaded through `react-native-dotenv` as the `@env` module):

```
API_URL_IOS=http://localhost:8080
API_URL_ANDROID=http://10.0.2.2:8080
MEDIA_URL_IOS=http://localhost:9000/media
MEDIA_URL_ANDROID=http://10.0.2.2:9000/media
```

The Android emulator reaches your computer at `10.0.2.2`, not `localhost`. After changing `.env`, restart Metro with `npm start -- --reset-cache`.

## Code layout

```
App.jsx                  navigation stack, auto-login, session-expired handling
src/screens/             one file per screen
src/components/Post/     a single feed video with its overlay controls
src/api/client.js        the one axios instance (gateway base URL, Bearer token, refresh-and-retry)
src/api/errors.js        getErrorMessage(): the server's message, or a plain network/timeout message
src/api/feed.js          GET /feed paging
src/api/uploadStatus.js  polls an upload until it's ready or failed
src/api/uploadLimits.js  size/length limits (mirrors the upload service)
src/context/AuthContext.js  the access token, readable from React and from the axios interceptors
```

All requests go through `apiClient` from `src/api/client.js`; don't call axios directly. When an access token expires, the client refreshes it once and retries. Auth endpoints listed in `AUTH_EXEMPT_PATHS` never trigger a refresh.

## Tests and lint

```bash
npm test       # Jest (only the default App test so far)
npm run lint   # ESLint (the config currently fails to load: `requireConfigFile` in .eslintrc.js)
```

More detail for contributors is in [`CLAUDE.md`](CLAUDE.md).
