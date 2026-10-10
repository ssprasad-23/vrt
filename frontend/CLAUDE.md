# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # start Metro bundler (run in its own terminal)
npm run android     # build and run on Android emulator/device
npm run ios         # build and run on iOS simulator/device
npm run lint        # eslint .
npm test            # jest
npx jest __tests__/App.test.tsx   # run a single test file
npx jest -t "renders correctly"   # run a single test by name
```

There is no `typecheck` script even though TypeScript is configured (`tsconfig.json` extends `@react-native/typescript-config`) — the codebase is almost entirely `.js`/`.jsx`, with TS only backing the NativeWind type declarations and the one `.tsx` test file.

Android builds require the Android toolchain set up per React Native's environment-setup docs; iOS builds require CocoaPods installed under `ios/` (standard RN 0.76 project, no custom native modules beyond what's in `package.json`).

**Environment config**: API base URLs are supplied via `.env` (loaded through `react-native-dotenv`, aliased as the `@env` module — see `babel.config.js` and `env.d.ts`), not committed. Copy `.env.example` to `.env` before running against a local backend. The app itself (via `@env`) reads six vars: `AUTH_API_URL_IOS`/`AUTH_API_URL_ANDROID` (`http://localhost:3000` / `http://10.0.2.2:3000`), `VIDEO_API_URL_IOS`/`VIDEO_API_URL_ANDROID` (the API gateway, `http://localhost:8080` / `http://10.0.2.2:8080` — upload and feed calls both go through it), and `MEDIA_URL_IOS`/`MEDIA_URL_ANDROID` (public media bucket, `http://localhost:9000/media` / `http://10.0.2.2:9000/media`) — each needing the Android-emulator loopback alias (`10.0.2.2`) instead of `localhost`. `.env` may also carry `S3_ENDPOINT`/`AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`S3_BUCKET_NAME` for a local MinIO instance, but those are only consumed by the standalone Node scripts in `src/test/` (via the `dotenv` package, not `react-native-dotenv`/`@env`) — not by the RN app.

## Product direction

This app is oriented toward **gaming and a stylized, TikTok-like vertical video-scrolling feed** — not a generic social app. `Home`/`Post` (the vertically-snapping video feed) is the core surface post-login, not a side feature; login/signup exist mainly to gate entry into that feed. Lean into that framing for styling and UX decisions (dark, immersive, video-first over the feed; overlay controls rather than standard screen chrome) rather than defaulting to conventional list/form UI patterns.

## Architecture

This is a React Native 0.76 app (not Expo — uses the community CLI, has native `ios/`/`android/` projects) styled with **NativeWind v4** (Tailwind classes via `className`, configured in `tailwind.config.js`/`metro.config.js`/`global.css`) mixed with plain `StyleSheet.create` objects. There is no consistent styling convention yet — `loginPage.js` uses Tailwind `className`, `signupPage.js`/`uploadPage.js`/`Post` use `StyleSheet` objects in sibling `*Styles.js`/`styles.js` files. Follow whichever pattern the file you're editing already uses.

**Entry point chain**: `index.js` registers `App` (from `App.jsx`) via `AppRegistry`. `App.jsx` wraps everything in `SafeAreaProvider` → `AuthProvider` → `NavigationContainer` → a single native-stack `Navigator` with `headerShown: false`.

**Navigation graph** (`App.jsx`) wires up `LoginPage`, `SignupPage`, `Home` (the video feed), and `UploadPage` (presented as a modal). `LoginPage` navigates to `Home` via `navigation.reset(...)` on successful sign-in, and `Home`'s overflow menu (⋮ button, top-right) has "Upload" (→ `navigation.navigate('UploadPage')`) and "Log Out" (→ `navigation.reset(...)` back to `LoginPage`) options. Login/logout use `reset` rather than `navigate`/`goBack` so the stack doesn't accumulate a poppable path between the logged-in and logged-out states.

**Auth**: Both `LoginPage` (`src/screens/loginPage.js`) and `SignupPage` (`src/screens/signupPage.js`) hit a real backend via `apiClient` (POST `/userLogin` and `/userSignUp` respectively). A successful login response is expected as `res.data.data.accessToken`; both screens also check `res.data?.errors` and throw a joined error message on failure. `src/context/AuthContext.js` holds the token in React state (`AuthProvider`/`useAuth`) *and* mirrors it into a module-level variable so the axios interceptors in `src/api/client.js` — which run outside React — can read/update it synchronously (`getAccessToken()`/`setAccessTokenExternal()`), attaching `Authorization: Bearer <token>` to outgoing requests and `console.log`ging whether a token was/wasn't attached on every request.

Both `apiClient` and `videoClient` are created with `withCredentials: true` and share a response interceptor that transparently refreshes expired access tokens: on a 401/403 (unless the request hit one of `AUTH_EXEMPT_PATHS` — `/refreshToken`, `/userLogin`, `/userSignUp`, `/logout` — or has already been retried), it POSTs to the auth service's `/refreshToken` (sending the httpOnly refresh cookie), stores the new token via `setAccessTokenExternal`, and retries the original request once. Concurrent 401/403s share a single in-flight refresh call rather than each triggering their own. Logging out (`src/screens/home.js`) calls POST `/logout`, then clears the token via `setAccessToken(null)` regardless of whether that call succeeds.

**API client**: `src/api/client.js` exports a factory (`createClient(baseURL)`) used to build two independent axios instances — the default export (`apiClient`, auth service) and `videoClient` (video service) — pointed at the two base URLs described above under Environment config. Any new backend call should go through one of these two clients (adding a third client via the same factory if a new service is introduced) rather than calling `axios` directly.

**Data flow for the feed**: `src/screens/home.js` loads real videos via `src/api/feed.js`'s `fetchFeed(cursor)` — `videoClient` GET `/feed?limit=3&cursor=...`, which goes through the gateway to the sibling `../feed` service (see its `CLAUDE.md`). Each response is `{ videos, nextCursor }`; `Home` loads the first page on mount, appends the next page from `onEndReached` (guarded by a ref so overlapping loads can't double-append), stops once `nextCursor` is `null`, and pull-to-refresh starts over. `toPost` maps API videos into `Post`'s shape; the playable URL is `mediaUrl(videoKey)` = `MEDIA_URL_IOS`/`MEDIA_URL_ANDROID` (`@env`, the public MinIO `media` bucket) + the key. Only the on-screen video plays: `Home` tracks `activeIndex` via `onViewableItemsChanged` and passes `isActive` to `Post` (also false while another screen like Upload is focused). Feed videos set `ignoreSilentSwitch='ignore'` so they play sound even with the iOS silent switch on (the default follows it and plays muted). They also pass `selectedAudioTrack={{type: 'system'}}` explicitly: when it's unset, react-native-video 6.9's iOS code (`RCTPlayerOperations.setMediaSelectionTrackForCharacteristic`) gets type `""` and selects no audio track, so videos play silent. The app rotates (iOS `Info.plist` allows landscape; Android has no lock), so `Home` sizes each post, `getItemLayout` and `snapToInterval` from `useWindowDimensions()` and scrolls back to `activeIndex` when the height changes. `resizeMode` is chosen from `onLoad`'s `naturalSize` against the current screen: `cover` (fill) when the video and screen orientations match, otherwise `contain` (whole video, black bars) — `cover` on a 16:9 video crops ~3/4 of its width on an upright phone. Overlay controls add the side safe-area insets, since in landscape the Dynamic Island/notch is on a side edge; the menu `Modal` sets `supportedOrientations` or iOS would force portrait while it's open. `Post` manages its own local like/dislike state per render via `useState(props.post)`, not lifted to a parent/store; the feed has no usernames/avatars/likes yet, so it shows `user{userId}`, an initial placeholder avatar, and zero counts. `src/data/sampledata.js` is no longer used.

**Upload flow**: `UploadPage` (`src/screens/uploadPage.js`) lets a user pick a video (`react-native-image-picker`), enter a description, and choose a category, then runs the full presigned-URL pattern: POST `videoClient`'s `/videos/upload-init` with `{description, category}` returns `{videoId, uploadUrl}`; the client `fetch`es the picked video URI into a blob and `PUT`s it directly to `uploadUrl`; on success it POSTs `/videos/${videoId}/complete` to finalize. Errors at any step surface via `Alert.alert`. The backend side of this (presigned URL issuance, MinIO/S3 storage) lives in the sibling `../upload` service — see its own `CLAUDE.md`.

`src/test/s3Client.js` and `src/test/test.js` are standalone Node scripts (run outside the RN app, using the plain `dotenv` package rather than `@env`) for poking at the local MinIO bucket directly with `@aws-sdk/client-s3` — not wired into any screen or navigation flow, and not part of the app's actual upload path.

## Notes for this repo

- Filenames are inconsistent in casing (`loginPage.js`, `home.js`, `Post/index.js`) — match the existing file's convention rather than introducing a new one.
- Several files contain commented-out alternate values (e.g. alternate video URLs in `sampledata.js`, `Post/index.js`) — treat these as intentional scratch/reference, not dead code to clean up incidentally.