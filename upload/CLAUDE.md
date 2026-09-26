# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Express 5 REST API using ES modules (`"type": "module"` — use `import`/`export` throughout). Structure mirrors the sibling `auth` service (`~/Desktop/auth`).

**Request flow**: `server.js` → `src/routes/videoRouters.js` → `src/middleware/authenticate.js` (JWT check) → `src/controller/videoController.js` → `src/models/videoModels.js` (Postgres) / `src/utility/s3.js` (S3 presigned URLs). Routes are mounted at `/` in `server.js`, so paths are defined by the router itself (`POST /videos/upload-init`, `POST /videos/:id/complete`).

**Startup sequence** (`server.js`): verifies DB connectivity with `SELECT 1`, calls `initDb()` (`src/data/createTable.js`) to create the `videos` table if absent, then starts the HTTP server. A centralized error-handling middleware (last `app.use` in `server.js`) catches anything passed to `next(err)` from controllers and responds with a generic 500.

**Auth**: this service no longer verifies JWTs at all — the `gateway` service does that once, up front, and forwards the caller's identity as trusted headers. `src/middleware/authenticate.js` just checks `x-gateway-secret` matches `GATEWAY_SECRET` (must equal the gateway's value) and reads `req.user` off `x-user-id`/`x-user-email` — no `jsonwebtoken` dependency, no `ACCESS_TOKEN_SECRET` here anymore. See `gateway/CLAUDE.md` for the full auth model.

**Database** (`src/config/configDB.js`): exports a single `pg.Pool` instance, own database — not shared with the auth service (no cross-service foreign keys; `videos.user_id` is a plain integer). Configured via `.env`: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, plus `PORT` for the HTTP server.

**Schema** (`src/data/videosTable.sql`): `videos` table (`video_id UUID PRIMARY KEY`, `status`: `pending` → `uploaded`) with a `BEFORE UPDATE` trigger that auto-sets `updated_at`. `initDb()` checks for table existence before running the SQL (idempotent).

**S3** (`src/utility/s3.js`): `buildVideoKey(videoId)` builds the object key `{videoId}/{videoId}_original.mp4` in the `original` bucket (`S3_BUCKET_NAME`) — one folder per video, mirroring the transcode service's `{videoId}/{videoId}_AV1_{N}_{size}MB.mp4` in `media`; `generateUploadUrl(key, contentType)` returns just the presigned `PUT` URL string for that key. The `videoId` itself is minted once in `initUpload` (`videoController.js`, `uuidv4()`) and reused both for the S3 key and as the DB row's `video_id` (`videos.video_id` is `UUID`, not `SERIAL`) — one id, no reconciliation needed between the two. The actual file bytes never pass through this server — the client uploads directly to S3 with the presigned URL. `S3_ENDPOINT` (for MinIO), `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` are all present in local `.env`; optional `UPLOAD_URL_EXPIRY_SECONDS` (default 900) is not currently set.

**Response shape**: `videoController.js` uses a `handleResponse(res, status, message, data)` helper, matching the auth service's convention — keep using it for consistency rather than calling `res.json` directly.

## Services

Single-service repo — no microservices split within this repo, but it depends on the separate `auth` service (`~/Desktop/auth`) for identity.

| Service | Path | Port | Language/Runtime | Depends on | Owns data |
|---|---|---|---|---|---|
| video upload service | repo root, entry `server.js` | `PORT` (from `.env`) | Node.js, ES modules, Express 5 | PostgreSQL via `pg.Pool` (`src/config/configDB.js`); S3 via AWS SDK v3; the `gateway` service for identity (shared `GATEWAY_SECRET`, no direct call) | `videos` table |

## Data flow for key use cases

**Init upload** (`POST /videos/upload-init`, protected): `videoRouters.js` → `authenticate` → `initUpload` (`videoController.js`), which takes `{ description, category }` from the body, mints one `videoId = uuidv4()`, derives `filename = ${videoId}.mp4` and a hardcoded `contentType = 'video/mp4'`, builds `s3Key` via `buildVideoKey` (`s3.js`), inserts the pending row via `createVideoService` (`videoModels.js`, `INSERT ... status='pending'`, PK = `videoId`), then gets a presigned `PUT` URL via `generateUploadUrl` (`s3.js`) → `201` with `{ videoId, uploadUrl }`. Fully implemented.

**Client uploads directly to S3** using `uploadUrl` — bypasses this server entirely.

**Complete upload** (`POST /videos/:id/complete`, protected): `completeUpload` → `findVideoById` → `404` if missing or not owned by the caller, `409` if not `pending` → `400` if the object isn't in the bucket yet (`getUploadedSize`, HeadObject) → `sendTranscodeJob(videoId, s3_key)` (`src/utility/sqs.js`) queues `{ videoId, key }` on the transcode SQS queue → `markVideoUploaded` (`status='uploaded'`, `uploaded_at=now()`) → `200` with the updated row. The send happens *before* the status update on purpose: if SQS is down the row stays `pending` and the client can just retry `/complete` (a duplicate message from a retry is harmless — the transcode worker skips completed jobs).

Full step-by-step tables live in `UPLOAD_FLOW.md`.

## Event/message contracts

**Produces** to the transcode SQS queue (`TRANSCODE_QUEUE_URL`), consumed by the `transcode` service's worker: `{ "videoId": "<12-char id>", "key": "<videoId>/<videoId>_original.mp4" }` — `key` is the object key in `S3_BUCKET_NAME`. Sent once per successful `/complete`. SQS client in `src/config/sqsConfig.js` (`SQS_ENDPOINT` points it at ElasticMQ locally).

## Where things live

- Route definitions → `src/routes/videoRouters.js`
- Request handling / response shaping → `src/controller/videoController.js`
- DB queries (videos) → `src/models/videoModels.js`
- DB connection pool → `src/config/configDB.js`
- S3 key generation + presigned URL generation → `src/utility/s3.js`
- SQS client config → `src/config/sqsConfig.js`; sending transcode jobs → `src/utility/sqs.js`
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/videosTable.sql`
- Trust-the-gateway auth middleware (checks `x-gateway-secret`, reads identity off `x-user-id`/`x-user-email`) → `src/middleware/authenticate.js`
- Server bootstrap, DB health check, global error handler → `server.js`

## Local dev / run instructions

Requires a running PostgreSQL instance, a local S3-compatible store (MinIO), and a `.env` file with: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`, `GATEWAY_SECRET` (must match the `gateway` service), plus `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (optionally `UPLOAD_URL_EXPIRY_SECONDS`, default 900) for `src/utility/s3.js`, plus `TRANSCODE_QUEUE_URL` and `SQS_ENDPOINT` (ElasticMQ locally) for queuing transcode jobs — without `TRANSCODE_QUEUE_URL`, `/complete` returns 500 and the video stays `pending`. Then:

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

`server.js` creates the `videos` table on boot if it doesn't already exist — no separate migration step needed.

## Known issues

- `completeUpload` checks the object exists (`getUploadedSize`, a `HeadObject` in `src/utility/s3.js`) before queuing, returning `400` and leaving the row `pending` if it doesn't. It doesn't check the object's size or content, and there's no S3 event notification.