# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Express 5 REST API using ES modules (`"type": "module"`). Structure mirrors the sibling `upload` and `auth` services.

**Two entry points, one pipeline**: jobs reach the encode pipeline (`src/services/transcodeService.js`) either via `src/worker/transcodeWorker.js` (a BullMQ `Worker` consuming `{ videoId, url }` off the `av1-transcode` queue — the intended production path once the `upload` service's producer exists) or via `POST /transcode` on the HTTP API (`src/routes/transcodeRouters.js` → `src/middleware/authenticate.js` → `src/controller/transcodeController.js`, kept for manual triggering/testing). Both call `ensureTranscodeJob()` + `runTranscodeJob()` from the shared service — no duplicated encode logic between the two.

**Startup sequence** (`server.js`): identical to `upload` — `SELECT 1` DB check, `initDb()` (`src/data/createTable.js`) to create the `transcode_jobs` table if absent, then `startTranscodeWorker()` (`src/worker/transcodeWorker.js`) and the HTTP server. Same centralized error-handling middleware convention as `upload`.

**Encoding settings** (`src/config/encodingConfig.js`): `DEFAULT_ENCODING_SETTINGS` is global and the *only* place to change AV1 encoding behavior (codec, crf/bitrate, preset, resolution, frame rate, pixel format, audio codec/bitrate, container) — every job uses it as-is, there is no per-job override.

**Encoder** (`src/utility/ffmpeg.js`): shells out to the system `ffmpeg` binary (`FFMPEG_PATH` env, defaults to `ffmpeg` on PATH) via `child_process.spawn` — no ffmpeg wrapper library. Requires ffmpeg built with `--enable-libsvtav1` (default codec) or `--enable-libaom` (for `libaom-av1`). `buildAv1Args()` turns a merged settings object into the CLI arg list; `runFfmpeg()` runs it and rejects with the last ~2000 chars of stderr on a non-zero exit.

**Queue** (`src/worker/`): `redisConnection.js` builds the BullMQ connection options from `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`. `transcodeWorker.js`'s `startTranscodeWorker()` opens a `Worker` on `TRANSCODE_QUEUE_NAME` (default `av1-transcode`) with concurrency `TRANSCODE_CONCURRENCY` (default `1` — ffmpeg is CPU-bound, don't raise this without more cores). Its processor is idempotent: if a `transcode_jobs` row for that `videoId` already exists and is `completed`, it skips re-encoding instead of redoing the work on redelivery.

**Job flow** (`transcodeService.js`): `ensureTranscodeJob(videoId, sourceUrl)` creates a `pending` row (with `DEFAULT_ENCODING_SETTINGS` recorded on it) if one doesn't exist yet for that `videoId` (either entry point can be first to see it). `runTranscodeJob(videoId)` does the actual work against the existing row — mark `processing` → download source → run ffmpeg → upload output to S3 under `av1-encoded/` → mark `completed`/`failed`. All scratch files live under `TRANSCODE_TMP_DIR` (default OS tmp dir) in a per-job folder that's always cleaned up in a `finally` block. `GET /transcode/:videoId` returns the job row, plus a presigned `downloadUrl` once `status === 'completed'`.

**Database** (`src/config/configDB.js`): own `pg.Pool`, not shared with `upload`/`auth`. Same `.env` var names (`DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`).

**Schema** (`src/data/transcodeJobsTable.sql`): `transcode_jobs` table (`video_id VARCHAR(12) PRIMARY KEY` — same id space as `upload`'s `videos.video_id`, but no `user_id` column: a BullMQ job only carries `videoId`/`url`, no user context) with `status`: `pending` → `processing` → `completed`/`failed`, a `settings JSONB` column recording exactly what was used for that job, and the same `BEFORE UPDATE` auto-`updated_at` trigger pattern as `upload`.

**S3** (`src/utility/s3.js`): reuses `upload`'s bucket/credentials env vars. `buildAv1EncodedKey(videoId, container)` → `av1-encoded/{videoId}.{container}` — a top-level folder in the same bucket as `upload`'s `original/{userId}/...` uploads. Unlike `upload` (which only ever hands out presigned PUT URLs for direct client upload), this service has the encoded bytes on disk, so it uploads directly via `@aws-sdk/lib-storage`'s `Upload` (streamed, no full-file buffering). `generateDownloadUrl()` mirrors `upload`'s presigned-URL pattern but for `GetObjectCommand`.

**Auth**: this service no longer verifies JWTs at all — the `gateway` service does that once, up front, and forwards the caller's identity as trusted headers. `src/middleware/authenticate.js` just checks `x-gateway-secret` matches `GATEWAY_SECRET` (must equal the gateway's value) and reads `req.user` off `x-user-id`/`x-user-email` — no `jsonwebtoken` dependency, no `ACCESS_TOKEN_SECRET` here anymore. Only gates the HTTP route — the BullMQ worker has no auth of its own, since a queue job is assumed to come from a trusted internal producer. See `gateway/CLAUDE.md` for the full auth model.

## Where things live

- Route definitions → `src/routes/transcodeRouters.js`
- HTTP request handling / response shaping → `src/controller/transcodeController.js`
- BullMQ connection + worker (the primary job intake) → `src/worker/redisConnection.js`, `src/worker/transcodeWorker.js`
- Shared encode pipeline (used by both the worker and the HTTP route) → `src/services/transcodeService.js`
- DB queries (transcode_jobs) → `src/models/transcodeModels.js`
- DB connection pool → `src/config/configDB.js`
- Default AV1 encoding settings (bitrate, crf, preset, resolution, etc.) → `src/config/encodingConfig.js`
- ffmpeg CLI arg building + process spawning → `src/utility/ffmpeg.js`
- Source video download → `src/utility/download.js`
- S3 key generation, upload, presigned download URL → `src/utility/s3.js`
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/transcodeJobsTable.sql`
- Trust-the-gateway auth middleware (checks `x-gateway-secret`, reads identity off `x-user-id`/`x-user-email`) → `src/middleware/authenticate.js`
- Server bootstrap, DB health check, global error handler, worker startup → `server.js`

## Local dev / run instructions

Requires: a running PostgreSQL instance, a local S3-compatible store (MinIO), a running Redis instance, `ffmpeg` on PATH built with AV1 encoder support, and a `.env` file with `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`, `GATEWAY_SECRET` (must match the `gateway` service), `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (same bucket as `upload`), `REDIS_HOST`, `REDIS_PORT` (optionally `REDIS_PASSWORD`, `TRANSCODE_QUEUE_NAME`, `TRANSCODE_CONCURRENCY`, `FFMPEG_PATH`, `TRANSCODE_TMP_DIR`).

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

## Known issues / not yet implemented

- The BullMQ producer doesn't exist yet — nothing in `upload` (or elsewhere) pushes `{ videoId, url }` onto the `av1-transcode` queue yet. Until it does, `POST /transcode` is the only way to trigger a job.
- No auth check that the caller owns `videoId` before starting a job via the HTTP route (there's no `user_id` on `transcode_jobs` to check against). The BullMQ worker has no auth at all — it trusts whatever the producer enqueues.
- No retry/backoff on a failed job — must be re-triggered with the same `videoId`, which will 409 on the HTTP route (or silently redo the encode via the worker, since it only skips `completed` jobs) unless the failed row is deleted first.
- No progress reporting mid-encode — status only moves in discrete steps (`pending` → `processing` → `completed`/`failed`), not percentage complete.
