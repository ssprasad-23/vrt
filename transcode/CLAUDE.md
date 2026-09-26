# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run worker
npm run dev      # run worker with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Headless SQS worker using ES modules (`"type": "module"`) — no HTTP server, no routes. Folder structure otherwise mirrors the sibling `upload` and `auth` services.

**One entry point**: jobs reach the encode pipeline (`src/services/transcodeService.js`) only via `src/worker/transcodeWorker.js`, an `sqs-consumer` polling `{ videoId, key }` messages off an Amazon SQS queue, sent by the `upload` service's `completeUpload` (`upload/src/utility/sqs.js`). `key` is the original video's object key in the private `original` bucket (`S3_BUCKET_NAME`); the worker downloads it itself with its own S3 credentials rather than taking a presigned URL, so retries/DLQ redrives never fail on an expired link. There is deliberately no HTTP API — an earlier `POST /transcode` / `GET /transcode/:videoId` pair was removed because it let any logged-in user make this service fetch an arbitrary URL for an arbitrary `videoId`. To trigger a job manually, send a message to the queue (e.g. `aws sqs send-message`).

**Startup sequence** (`server.js`): identical to `upload` — `SELECT 1` DB check, `initDb()` (`src/data/createTable.js`) to create the `transcode_jobs` table if absent, then `startTranscodeWorker()` (`src/worker/transcodeWorker.js`). Any failure (including a missing `TRANSCODE_QUEUE_URL`) exits the process.

**Encoding settings** (`src/config/encodingConfig.js`): `DEFAULT_ENCODING_SETTINGS` is global and the *only* place to change AV1 encoding behavior (codec, crf/bitrate, preset, resolution, frame rate, pixel format, audio codec/bitrate, container) — every job uses it as-is, there is no per-job override. Defaults: `crf: 35`, `preset: 5`, `frameRate: 30` (a *maximum*, applied with `-fpsmax`, so 24/25fps uploads keep their rate). CRF is constant-quality, not a size target, and a LOWER CRF means a BIGGER file: at 25–30 the AV1 output of an already-compressed H.264 upload came out bigger than the upload; at 35 a 1080p60 upload came out ~43% smaller (preset 5, 30fps). `runTranscodeJob` logs a warning if the encode still isn't smaller than the original.

**Encoder** (`src/utility/ffmpeg.js`): shells out to the system `ffmpeg` binary (`FFMPEG_PATH` env, defaults to `ffmpeg` on PATH) via `child_process.spawn` — no ffmpeg wrapper library. Requires ffmpeg built with `--enable-libsvtav1` (default codec) or `--enable-libaom` (for `libaom-av1`). `buildAv1Args()` turns a merged settings object into the CLI arg list; `runFfmpeg()` runs it and rejects with the last ~2000 chars of stderr on a non-zero exit.

**Queue**: `src/config/sqsConfig.js` builds the `SQSClient` from `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (optional `SQS_ENDPOINT` points it at LocalStack/ElasticMQ for local dev) and exports `TRANSCODE_QUEUE_URL`. `src/worker/transcodeWorker.js`'s `startTranscodeWorker()` creates an `sqs-consumer` `Consumer` on that queue URL with `batchSize: 1` (ffmpeg is CPU-bound — one video at a time), 20s long polling, and a visibility-timeout heartbeat: it calls `ChangeMessageVisibility` every `SQS_HEARTBEAT_INTERVAL` seconds (default `60`) to keep extending the `SQS_VISIBILITY_TIMEOUT` lease (default `300`) for as long as the encode runs. If `TRANSCODE_QUEUE_URL` is unset `startTranscodeWorker()` throws, since the queue is the service's only job intake. A resolved handler deletes the message (ack); a thrown handler leaves it on the queue, so SQS redelivers it after the visibility timeout up to the queue's `maxReceiveCount` before it lands in the dead-letter queue — both configured on the queue itself, not in code. The handler is idempotent: if a `transcode_jobs` row for that `videoId` already exists and is `completed`, it acks without re-encoding. If the original is missing from the bucket (`NoSuchKey`), the job is marked `failed` and the message is acked rather than retried, since a redelivery can't succeed.

**Job flow** (`transcodeService.js`): `ensureTranscodeJob(videoId, sourceKey)` creates a `pending` row (with `DEFAULT_ENCODING_SETTINGS` recorded on it) if one doesn't exist yet for that `videoId`. `runTranscodeJob(videoId)` does the actual work against the existing row — mark `processing` → download source from `ORIGINAL_BUCKET` (`downloadFromS3`, `src/utility/download.js`) → probe duration with `ffprobe` (videos over 120s fail the job) → extract one random JPEG frame per 10s window (12 for a 120s video, 6 for 60s, fewer for shorter ones; `src/utility/frameExtraction.js`) and upload each to `{videoId}/frames/{videoId}_frame001.jpg` in the `media` bucket → run the AV1 encode → probe the output's dimensions/size and upload it to `{videoId}/{videoId}_{codec}_{N}_{size}MB.{container}` (e.g. `abc123/abc123_AV1_1080_2.0MB.mp4`) in the `media` bucket → mark `completed`/`failed`. All scratch files live under `TRANSCODE_TMP_DIR` (default OS tmp dir) in a per-job folder that's always cleaned up in a `finally` block. Nothing exposes job status over HTTP yet — the `transcode_jobs` row is the source of truth.

**Database** (`src/config/configDB.js`): own `pg.Pool`, not shared with `upload`/`auth`. Same `.env` var names (`DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`).

**Schema** (`src/data/transcodeJobsTable.sql`): `transcode_jobs` table (`video_id VARCHAR(12) PRIMARY KEY` — same id space as `upload`'s `videos.video_id`, `source_key` = the original's key in the `original` bucket, no `user_id` column: an SQS message only carries `videoId`/`key`, no user context) with `status`: `pending` → `processing` → `completed`/`failed`, a `settings JSONB` column recording exactly what was used for that job, and the same `BEFORE UPDATE` auto-`updated_at` trigger pattern as `upload`.

**S3** (client in `src/config/s3Config.js`, helpers in `src/utility/s3.js`): any S3-compatible store — MinIO for local dev, Cloudflare R2 planned; switching to R2 is env-only (`S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`, `AWS_REGION=auto`, R2 keys; `forcePathStyle: true` works on both). Reuses `upload`'s credentials/endpoint env vars. Two buckets across services: `original` (private — the `upload` service's source files, written via presigned PUT) and `media` (public-read, meant to sit behind a CDN — everything this service produces). This service reads sources from `ORIGINAL_BUCKET` (`S3_BUCKET_NAME`) and writes only to `S3_MEDIA_BUCKET_NAME` (default `media`), keyed per video: `buildEncodedKey()` → `{videoId}/{videoId}_{codec}_{N}_{size}MB.{container}` (codec label from `CODEC_LABELS`, `N` = shorter side, size in MiB to 1 decimal), `buildFrameKey()` → `{videoId}/frames/{videoId}_frame001.jpg`. The `media` bucket allows anonymous `GetObject` but not listing. `uploadFileToS3(bucket, key, filePath, contentType)` takes the bucket explicitly. Unlike `upload` (which only ever hands out presigned PUT URLs for direct client upload), this service has the encoded bytes on disk, so it uploads directly via `@aws-sdk/lib-storage`'s `Upload` (streamed, no full-file buffering).

**Auth**: none. The service isn't behind the `gateway` and takes no client requests; a queue message is assumed to come from a trusted internal producer (the `upload` service).

## Where things live

- SQS client config → `src/config/sqsConfig.js`
- S3 client config (MinIO now, R2 later) → `src/config/s3Config.js`
- SQS worker (the only job intake) → `src/worker/transcodeWorker.js`
- Encode pipeline → `src/services/transcodeService.js`
- DB queries (transcode_jobs) → `src/models/transcodeModels.js`
- DB connection pool → `src/config/configDB.js`
- Default AV1 encoding settings (bitrate, crf, preset, resolution, etc.) → `src/config/encodingConfig.js`
- ffmpeg CLI arg building + process spawning → `src/utility/ffmpeg.js`
- Duration + dimensions probe (ffprobe), 120s limit, random frame-per-10s selection + extraction → `src/utility/frameExtraction.js`
- Source video download from the `original` bucket → `src/utility/download.js`
- S3 key generation, upload → `src/utility/s3.js` (imports the client from `s3Config.js`)
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/transcodeJobsTable.sql`
- Bootstrap, DB health check, worker startup → `server.js`

## Local dev / run instructions

Requires: a running PostgreSQL instance, a local S3-compatible store (MinIO) with a public-read `media` bucket, an SQS queue (real AWS, or ElasticMQ locally: `docker run -d --name elasticmq -p 9324:9324 -p 9325:9325 softwaremill/elasticmq`, then create `av1-transcode` — the port must be published to the host), `ffmpeg` on PATH built with AV1 encoder support, and a `.env` file with `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `TRANSCODE_QUEUE_URL` (optionally `S3_MEDIA_BUCKET_NAME` (default `media`), `SQS_ENDPOINT`, `SQS_VISIBILITY_TIMEOUT`, `SQS_HEARTBEAT_INTERVAL`, `FFMPEG_PATH`, `FFPROBE_PATH`, `TRANSCODE_TMP_DIR`). Without `TRANSCODE_QUEUE_URL` the service refuses to start.

```bash
npm start        # run worker
npm run dev      # run worker with auto-reload (node --watch)
```

## Known issues / not yet implemented

- The worker has no auth at all — it trusts whatever the producer sends, including `key` (it can only read from the `original` bucket, but anything with `SendMessage` on the queue can make it transcode any object there). Keep queue permissions tight.
- No way for a client to see job status (ready / failed) — needs to be surfaced somewhere, e.g. a status on `upload`'s `videos` row.
- Retry/backoff and the dead-letter queue are configured on the SQS queue (`maxReceiveCount` + redrive policy), not in this codebase — a fresh checkout has none of that until the queue is set up. A redelivered message for a `failed` job redoes the encode, since the worker only skips `completed` jobs.
- No progress reporting mid-encode — status only moves in discrete steps (`pending` → `processing` → `completed`/`failed`), not percentage complete.
