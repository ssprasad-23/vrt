# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Express 5 REST API using ES modules (`"type": "module"`). Structure mirrors the sibling `upload` service. Read-only: it serves the video feed out of the `videos` table and writes nothing.

**Request flow**: `server.js` → `src/routes/feedRouters.js` → `src/middleware/authenticate.js` (gateway-secret check, same as upload's) → `src/controller/feedController.js` → `src/models/feedModels.js` (Postgres). Reached only through the gateway (`GET /feed` there → `GET /feed` here); a direct call gets `403`.

**Data ownership**: the `videos` table is owned and created by the `upload` service (`upload/src/data/videosTable.sql`); this service connects to the same database and only `SELECT`s from it, so there's no `initDb()` here. If upload's schema changes (`h264_s3_key`, `av1_s3_key`, `created_at`, `video_id`, `user_id`, `description`, `category`), update `getFeedPage`.

**`GET /feed?limit=3&cursor=...`** → `{ videos: [{ videoId, userId, videoKey, videoKeys: { h264, av1 }, description, category, createdAt }], nextCursor }` via the usual `handleResponse` shape. Only rows with `h264_s3_key` set are returned, newest first — H.264 plays on every device and finishes well before AV1. `videoKey` is that H.264 key in the public `media` bucket (`videoKeys.av1` is null until the AV1 encode finishes, and only worth using on devices with a hardware AV1 decoder) — the client builds the playable URL itself (the base differs per platform, e.g. `10.0.2.2` on the Android emulator), so no S3 client or presigning here. `limit` defaults to 3, max 20.

**Pagination** is keyset on `(created_at, video_id)` DESC — `nextCursor` (`src/utility/cursor.js`) is the last row of the page, base64url-encoded, and `null` when there's nothing more. The controller fetches `limit + 1` rows to know if another page exists. The cursor keeps `created_at` as Postgres text (`created_at::text`, microsecond precision) — a JS `Date` rounds to milliseconds and would skip/repeat rows at page boundaries.

**Redis cache** (`src/config/redisConfig.js`, used in `feedController.js`): the first page only (no cursor, `limit` = 3) is cached as `feed:first` for 30s, cache-aside. Responses carry `X-Cache: HIT` / `MISS` / `BYPASS` (cursor pages get no header), and each decision is logged as `Redis HIT: …` / `Redis MISS: …` / `Redis SET: …` / `Redis BYPASS: …`. On a miss the response is sent first and the `SET` runs in the background; an empty page is not cached (logged as `Redis SET skipped: …`). Fail-open: if Redis is down the service still starts (`connectRedis()` isn't awaited, the client reconnects in the background, `disableOfflineQueue` makes commands fail fast) and requests fall through to Postgres. No invalidation — a new video can take up to 30s to reach the top. Setup and design notes: `../redis/README.md`.

## Local dev / run instructions

`.env`: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT` (same DB as `upload`), `PORT` (3003), `GATEWAY_SECRET` (must match the gateway's), `REDIS_URL` (default `redis://localhost:6379`; Redis is optional). The gateway reaches it via `FEED_SERVICE_URL` (default `http://localhost:3003`).

## Known issues

- No index backing the feed query yet — fine at current size; at scale add `CREATE INDEX ON videos (created_at DESC, video_id DESC) WHERE h264_s3_key IS NOT NULL` in upload's schema.
- No usernames/avatars/likes: the auth DB is separate, so the client shows `user{userId}` and zero counts.
