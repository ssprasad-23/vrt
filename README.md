# VRT

A short-video app for gaming clips: a TikTok-style vertical feed in a React Native app, backed by Node.js microservices. Users sign up, upload clips of up to 60 seconds, and scroll a feed of everyone's videos. Each upload is transcoded to H.264 (plays everywhere) and AV1 (smaller, for devices with hardware decode).

## Architecture

```
                          ┌──────────────────────────────────────────────┐
  React Native app ─────► │ gateway :8080  (JWT check, rate limits)      │
  (frontend)              └──┬──────────────┬──────────────┬─────────────┘
       │                     │ /auth/*      │ /videos/*    │ /feed
       │                     ▼              ▼              ▼
       │               ┌──────────┐   ┌──────────┐   ┌──────────┐
       │               │ auth     │   │ upload   │   │ feed     │──► Redis
       │               │ :3000    │   │ :3001    │   │ :3003    │    (first page cache)
       │               └────┬─────┘   └──┬────▲──┘   └────┬─────┘
       │                    │ Resend     │    │           │
       │                    ▼ (email)    │SQS │SQS        │
       │               PostgreSQL ◄──────┤    │           │
       │                    ▲            ▼    │           │
       │                    │       ┌───────────┐         │
       │                    └───────│ transcode │ ffmpeg  │
       │                            │ (worker)  │         │
       │                            └─────┬─────┘         │
       │  presigned PUT (original)        │               │
       └──────────────────────────► MinIO / S3 ◄──────────┘
         GET encoded video (media)  buckets: original (private), media (public)
```

The app only ever talks to the **gateway** (plus MinIO directly for the upload itself and for playing videos). The gateway verifies the access token once and forwards the user's id to `upload` and `feed` in trusted headers.

| Service | Port | What it does | Owns |
|---|---|---|---|
| [`gateway`](gateway) | 8080 | Single entry point. Proxies `/auth/*` → auth, `/videos/*` → upload, `/feed` and `/blocks/*` → feed. Verifies JWTs for `/videos`, `/feed` and `/blocks`. Per-IP rate limits on password reset. | — |
| [`auth`](auth) | 3000 | Signup, login, refresh-token rotation, logout, password reset by emailed 6-digit code. | `users`, `refresh_tokens`, `password_reset_codes` |
| [`upload`](upload) | 3001 | Issues presigned upload URLs, confirms uploads, queues transcode jobs, records finished encodes, upload status. | `videos` |
| [`transcode`](transcode) | — | Headless SQS worker. Downloads the original, checks it (≤ 60s), extracts preview frames, encodes H.264 then AV1 with ffmpeg, uploads to `media`, reports back. | `transcode_jobs` |
| [`feed`](feed) | 3003 | Paginated feed of ready videos, newest first, hiding blocked users both ways. Block/unblock/list users. Caches the first page in Redis for 30s for viewers with no blocks. | `user_blocks` (reads `videos`) |
| [`frontend`](frontend) | — | React Native 0.76 app (iOS/Android): login/signup/password reset, video feed, upload. | — |
| [`redis`](redis) | 6379 | Config and docs for the feed cache. | — |

Infrastructure: **PostgreSQL**, **MinIO** (S3-compatible storage; Cloudflare R2 planned), **ElasticMQ** (SQS-compatible queue; real SQS in production), **Redis** (optional), **Resend** (email).

## How the main flows work

### Accounts

- **Login** returns a 15-minute access token (JWT) in the body and a 30-day refresh token in an `httpOnly` cookie. Refresh tokens are random, stored only as hashes, and rotate on every use. Reusing an old one revokes that login session.
- **Auto-login**: on launch the app silently calls `/auth/refreshToken`. If it works, the user goes straight to the feed.
- **Password reset**: `POST /auth/forgotPassword` emails a 6-digit code (10-minute expiry, 5 guesses). `POST /auth/verifyResetCode` exchanges the right code for a one-time reset token. `POST /auth/resetPassword` sets the new password and logs the user out everywhere. The first step always answers the same way, so it can't reveal which emails have accounts.

Password reset limits:

| What | Limit | Enforced by |
|---|---|---|
| Code validity | 10 minutes from when it's sent; requesting a new code cancels the old one | auth |
| Wrong guesses | 5 per code, then the code stops working | auth |
| Reset token (after a correct code) | 10 minutes, single use | auth |
| Codes sent to one account | 1 per 60 seconds, 5 per hour (extra requests are silently ignored) | auth |
| `forgotPassword` requests per IP | 5 per 15 minutes, then `429` | gateway |
| `verifyResetCode` / `resetPassword` requests per IP | 10 per 15 minutes each, then `429` | gateway |

Details: [`auth/AUTH_FLOW.md`](auth/AUTH_FLOW.md).

### Uploading a video

1. `POST /videos/upload-init` → `upload` creates a `pending` row and returns a presigned PUT URL for the `original` bucket.
2. The app uploads the file **directly to MinIO** with that URL; the bytes never pass through a service.
3. `POST /videos/:id/complete` → `upload` checks the file exists and is under the size limit, sends `{ videoId, key }` to the `av1-transcode` queue, and marks the row `uploaded`.
4. `transcode` picks up the job. It encodes H.264 first and reports it on `av1-transcode-completed` as soon as it's saved, so the video reaches the feed without waiting for AV1. `upload` marks the video `ready`.
5. The app polls `GET /videos/:id` and tells the user when the video is ready, or why it failed (e.g. longer than 60s).

Failed jobs are retried up to 3 times, then reported as `failed`. Dead-letter queues catch messages that can't be processed at all. Details: [`upload/UPLOAD_FLOW.md`](upload/UPLOAD_FLOW.md), [`transcode/CLAUDE.md`](transcode/CLAUDE.md).

### Watching the feed

`GET /feed?limit=3&cursor=…` returns ready videos newest first, with keyset pagination. The app builds each playable URL from the public `media` bucket and plays only the video on screen. See [`redis/README.md`](redis/README.md) for the cache.

## Local setup

### Prerequisites

- Node.js 20+ (developed on 23) and npm
- PostgreSQL running locally
- Docker (for MinIO, ElasticMQ, Redis)
- ffmpeg with `libx264` and `libsvtav1` (`brew install ffmpeg`)
- Xcode (iOS) and/or Android Studio, set up per the [React Native environment guide](https://reactnative.dev/docs/set-up-your-environment)
- A [Resend](https://resend.com) API key, if you want password reset codes actually emailed

### 1. Install dependencies

```bash
npm install                     # root: concurrently
for s in gateway auth upload transcode feed frontend; do npm install --prefix $s; done
cd frontend/ios && pod install && cd ../..
```

### 2. Start the infrastructure

Choose your own MinIO admin username and password. The services use these as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, so put the same values in the `upload` and `transcode` `.env` files.

```bash
export MINIO_ROOT_USER=<choose-a-username>
export MINIO_ROOT_PASSWORD=<choose-a-password>   # at least 8 characters

# Object storage (console at http://localhost:9001)
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD \
  -v ~/minio-data:/data quay.io/minio/minio server /data --console-address :9001

# Queue
docker run -d --name elasticmq -p 9324:9324 -p 9325:9325 softwaremill/elasticmq

# Feed cache (optional; feed works without it)
docker run -d --name redis -p 6379:6379 \
  -v "$(pwd)/redis/redis.conf:/usr/local/etc/redis/redis.conf" \
  redis:8-alpine redis-server /usr/local/etc/redis/redis.conf
```

Create the buckets: `original` is private, and `media` allows anonymous reads of files (but not listing):

```bash
docker exec minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" &&
  mc mb -p local/original local/media &&
  echo "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::media/*\"]}]}" > /tmp/p.json &&
  mc anonymous set-json /tmp/p.json local/media'
```

Create the queues and their dead-letter queues:

```bash
for q in av1-transcode av1-transcode-completed; do
  curl -s "http://localhost:9324/?Action=CreateQueue&QueueName=$q" > /dev/null
done
node transcode/scripts/setupQueues.js
```

ElasticMQ keeps queues in memory, so **repeat this step whenever the `elasticmq` container restarts**. Otherwise `upload` and `transcode` log `SQS receive message failed` non-stop.

### 3. Configure each service

Each service reads its own `.env` (gitignored; there are no `.env.example` files yet). Tables are created automatically on startup. Locally all services can share one database.

| Service | Variables |
|---|---|
| `gateway` | `PORT=8080`, `ACCESS_TOKEN_SECRET` (same as auth), `GATEWAY_SECRET` (same as upload and feed), `AUTH_SERVICE_URL`, `UPLOAD_SERVICE_URL`, `FEED_SERVICE_URL` |
| `auth` | `PORT=3000`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_DATABASE`, `ACCESS_TOKEN_SECRET`, `RESET_CODE_SECRET`; optional `ACCESS_TOKEN_EXPIRY` (15m), `REFRESH_TOKEN_TTL_DAYS` (30), `RESEND_API_KEY`, `RESEND_FROM` |
| `upload` | `PORT=3001`, `DB_*`, `GATEWAY_SECRET`, `S3_ENDPOINT=http://localhost:9000`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME=original`, `SQS_ENDPOINT=http://localhost:9324`, `TRANSCODE_QUEUE_URL`, `TRANSCODE_COMPLETED_QUEUE_URL`; optional `MAX_UPLOAD_MB` (500), `UPLOAD_URL_EXPIRY_SECONDS` (900) |
| `transcode` | `DB_*`, the same S3 and SQS variables as upload; optional `S3_MEDIA_BUCKET_NAME` (media), `TRANSCODE_MAX_ATTEMPTS` (3), `SQS_VISIBILITY_TIMEOUT` (300), `SQS_HEARTBEAT_INTERVAL` (60), `FFMPEG_PATH`, `FFPROBE_PATH`, `TRANSCODE_TMP_DIR` |
| `feed` | `PORT=3003`, `DB_*`, `GATEWAY_SECRET`; optional `REDIS_URL` (redis://localhost:6379) |
| `frontend` | `API_URL_IOS=http://localhost:8080`, `API_URL_ANDROID=http://10.0.2.2:8080`, `MEDIA_URL_IOS=http://localhost:9000/media`, `MEDIA_URL_ANDROID=http://10.0.2.2:9000/media` |

Queue URLs locally: `http://localhost:9324/000000000000/av1-transcode` and `http://localhost:9324/000000000000/av1-transcode-completed`.

Generate secrets with `openssl rand -hex 32`. Without `RESEND_API_KEY`, password reset codes are printed in the auth log instead of emailed. With the `onboarding@resend.dev` sender, Resend only delivers to your own Resend account address; verify a domain to email anyone.

### 4. Run everything

```bash
npm run dev     # gateway, auth, upload, transcode, feed, and the iOS app
npm run dev1    # same, with each service's output labelled and coloured
```

Or one at a time: `npm run dev:auth`, `npm run dev:gateway`, and so on. For Android, run `npm run android --prefix frontend`.

## Repository layout

```
gateway/     API gateway (Express + http-proxy-middleware)
auth/        accounts, tokens, password reset
upload/      upload URLs, upload status, videos table
transcode/   SQS worker: ffmpeg encodes, frames  (scripts/: queue setup, requeue)
feed/        paginated video feed
frontend/    React Native app
redis/       Redis config and cache docs
```

Every service is Express 5 with ES modules and raw `pg`. Each one has a `CLAUDE.md` with its full architecture, data flow and known issues. Read that before changing a service.

## Known limitations

- No automated tests yet.
- Login and signup aren't rate limited (only password reset is). Gateway rate-limit counters are in memory, so they reset on restart and aren't shared across instances.
- Access tokens stay valid until they expire (up to 15 minutes) after logout or a password reset.
- The feed has no usernames, avatars or likes yet: the app shows `user{id}` and zero counts.
- Abandoned uploads (never completed) stay in the `original` bucket.
