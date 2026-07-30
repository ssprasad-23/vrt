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

**Auth**: this service does not issue tokens — it only verifies them. `src/middleware/authenticate.js` and `src/utility/tokens.js` (`verifyAccessToken` only) are copied from the auth service. `ACCESS_TOKEN_SECRET` in `.env` must match the auth service's value exactly, since access tokens are minted there and verified here with no network call between the two services.

**Database** (`src/config/configDB.js`): exports a single `pg.Pool` instance, own database — not shared with the auth service (no cross-service foreign keys; `videos.user_id` is a plain integer). Configured via `.env`: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, plus `PORT` for the HTTP server.

**Schema** (`src/data/videosTable.sql`): `videos` table (`video_id UUID PRIMARY KEY`, `status`: `pending` → `uploaded`) with a `BEFORE UPDATE` trigger that auto-sets `updated_at`. `initDb()` checks for table existence before running the SQL (idempotent).

**S3** (`src/utility/s3.js`): `buildVideoKey(userId, videoId, filename)` builds a unique object key (`original/{userId}/{videoId}-{safeFilename}`); `generateUploadUrl(key, contentType)` returns just the presigned `PUT` URL string for that key. The `videoId` itself is minted once in `initUpload` (`videoController.js`, `uuidv4()`) and reused both for the S3 key and as the DB row's `video_id` (`videos.video_id` is `UUID`, not `SERIAL`) — one id, no reconciliation needed between the two. The actual file bytes never pass through this server — the client uploads directly to S3 with the presigned URL. `S3_ENDPOINT` (for MinIO), `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` are all present in local `.env`; optional `UPLOAD_URL_EXPIRY_SECONDS` (default 900) is not currently set.

**Response shape**: `videoController.js` uses a `handleResponse(res, status, message, data)` helper, matching the auth service's convention — keep using it for consistency rather than calling `res.json` directly.

## Services

Single-service repo — no microservices split within this repo, but it depends on the separate `auth` service (`~/Desktop/auth`) for identity.

| Service | Path | Port | Language/Runtime | Depends on | Owns data |
|---|---|---|---|---|---|
| video upload service | repo root, entry `server.js` | `PORT` (from `.env`) | Node.js, ES modules, Express 5 | PostgreSQL via `pg.Pool` (`src/config/configDB.js`); S3 via AWS SDK v3; auth service's JWTs (shared `ACCESS_TOKEN_SECRET`, no direct call) | `videos` table |

## Data flow for key use cases

**Init upload** (`POST /videos/upload-init`, protected): `videoRouters.js` → `authenticate` → `initUpload` (`videoController.js`), which takes `{ description, category }` from the body, mints one `videoId = uuidv4()`, derives `filename = ${videoId}.mp4` and a hardcoded `contentType = 'video/mp4'`, builds `s3Key` via `buildVideoKey` (`s3.js`), inserts the pending row via `createVideoService` (`videoModels.js`, `INSERT ... status='pending'`, PK = `videoId`), then gets a presigned `PUT` URL via `generateUploadUrl` (`s3.js`) → `201` with `{ videoId, uploadUrl }`. Fully implemented.

**Client uploads directly to S3** using `uploadUrl` — bypasses this server entirely.

**Complete upload** (`POST /videos/:id/complete`, protected): `completeUpload` → `findVideoById` → `404` if missing or not owned by the caller, `409` if not `pending` → `markVideoUploaded` (`status='uploaded'`, `uploaded_at=now()`) → `200` with the updated row. This path is fully implemented.

Full step-by-step tables live in `UPLOAD_FLOW.md`.

## Event/message contracts

None — no message queue or pub/sub broker. All communication is synchronous HTTP request/response, plus direct client→S3 uploads via presigned URL.

## Where things live

- Route definitions → `src/routes/videoRouters.js`
- Request handling / response shaping → `src/controller/videoController.js`
- DB queries (videos) → `src/models/videoModels.js`
- DB connection pool → `src/config/configDB.js`
- S3 key generation + presigned URL generation → `src/utility/s3.js`
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/videosTable.sql`
- Bearer-token auth middleware (verify-only, copied from the auth service) → `src/middleware/authenticate.js`, `src/utility/tokens.js`
- Server bootstrap, DB health check, global error handler → `server.js`

## Local dev / run instructions

Requires a running PostgreSQL instance, a local S3-compatible store (MinIO), and a `.env` file with: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`, `ACCESS_TOKEN_SECRET` (must match the auth service), plus `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (optionally `UPLOAD_URL_EXPIRY_SECONDS`, default 900) for `src/utility/s3.js`. Then:

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

`server.js` creates the `videos` table on boot if it doesn't already exist — no separate migration step needed.

## Known issues

- `completeUpload` trusts the client's signal that the S3 upload succeeded — it does not verify the object actually exists in the bucket (no `HeadObject` check or S3 event notification wired up yet).