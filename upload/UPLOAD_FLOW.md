# Video Upload Service Sequence

Based on `videoRouters.js` → `videoController.js` → `videoModels.js` / `s3.js` / `sqs/`.

Clients reach this service only through the gateway. The gateway verifies the
access token and forwards the user's id as `x-user-id`, together with the shared
`x-gateway-secret`. `authenticate.js` checks the secret and sets
`req.user = { userId }`. This service never sees or verifies a JWT, and a direct call gets `403`.

## Init upload — `POST /videos/upload-init`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends `{ description, category, sizeBytes?, durationSeconds? }` through the gateway |
| 2 | `authenticate` | Checks `x-gateway-secret`, sets `req.user = { userId }` from `x-user-id` |
| 3 | `initUpload` | `400` if description/category are missing or too long (500 / 100 chars) |
| 4 | `initUpload` | Early rejection from the client-reported size/length: `413` over `MAX_UPLOAD_MB` (default 500), `400` over 60s. Not trusted; enforced again later |
| 5 | `initUpload` | `generateVideoId()`: 12-char random base64url id, used for the S3 key and the DB row |
| 6 | `s3.js` | `buildVideoKey(videoId)` → `{videoId}/{videoId}_original.mp4` in the `original` bucket |
| 7 | `videoModels.js` | `createVideoService(...)` → `INSERT INTO videos ... status = 'pending'` |
| 8 | `s3.js` | `generateUploadUrl(key, 'video/mp4')`: presigned `PUT` URL, 15 min default expiry |
| 9 | Controller | `201` with `{ videoId, uploadUrl }` |

**The client then uploads the file directly to S3/MinIO with `uploadUrl`**. The bytes never pass through this server.

## Complete upload — `POST /videos/:id/complete`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Calls `/complete` after the S3 upload succeeds |
| 2 | `videoModels.js` | `findVideoById(id)`: `404` if missing or not owned by the caller |
| 3 | — | `409 Upload already completed` if `status !== 'pending'` |
| 4 | `s3.js` | `getUploadedSize()` (HeadObject): `400` if the file isn't in the bucket yet (row stays `pending`, client can retry) |
| 5 | — | Over `MAX_UPLOAD_BYTES` (a presigned PUT can't cap size): delete the object, mark the row `failed`, `413` |
| 6 | `sqs/outgoing.js` | `sendTranscodeJob(videoId, key)` → `{ videoId, key }` on `TRANSCODE_QUEUE_URL` |
| 7 | `videoModels.js` | `markVideoUploaded(id, originalSizeMb)` → `status = 'uploaded'`, `uploaded_at = now()` |
| 8 | Controller | `200` with the updated row |

The job is queued **before** the status changes. If SQS is down, the row stays
`pending` and the client can retry `/complete`. A duplicate job from a retry is
harmless, because the transcode worker skips completed jobs.

## Finished encodes — `sqs/incoming.js` (consumer on `TRANSCODE_COMPLETED_QUEUE_URL`)

| Message from `transcode` | Action |
|---|---|
| `{ videoId, codec: 'h264', outputKey, sizeMb }` | `setEncodedKey` saves `h264_s3_key` / `h264_size_mb` and marks the video `ready`, so it now appears in the feed |
| `{ videoId, codec: 'av1', outputKey, sizeMb }` | Saves `av1_s3_key` / `av1_size_mb` |
| `{ videoId, status: 'failed', reason }` | `markVideoFailed`: only moves `pending`/`uploaded` rows, so a late AV1 failure can't unpublish a `ready` video |

Unknown codecs and unknown video ids are logged and acked. A thrown error leaves
the message on the queue for SQS to redeliver.

## Upload status — `GET /videos/:id`

Owner only (`404` otherwise). Returns `{ videoId, status, failureReason }`, where
`status` is `pending` | `uploaded` (processing) | `ready` | `failed`. The app polls
this every 5s after an upload to tell the user when the video is live or why it failed.

## Notes

- `videos.user_id` is a plain integer, not a foreign key. Identity belongs to the auth
  service, so there's no cross-service FK.
- An upload that's started but never completed leaves its file in the `original`
  bucket. Nothing cleans those up yet.
