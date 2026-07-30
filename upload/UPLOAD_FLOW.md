# Video Upload Service Sequence

Based on `videoRouters.js` → `videoController.js` → `videoModels.js` / `s3.js`.

Auth is delegated to the auth service: the client authenticates there first and
sends the resulting access token as a `Bearer` header here. `authenticate.js`
verifies it locally (shared `ACCESS_TOKEN_SECRET`, no call to the auth service).

## Init upload — `POST /videos/upload-init`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends `Authorization: Bearer <accessToken>` + `{ description, category }` |
| 2 | `authenticate` | Verifies JWT, sets `req.user = { userId, email }` |
| 3 | `initUpload` | Mints one `videoId = uuidv4()`; derives `filename = ${videoId}.mp4` and a hardcoded `contentType = 'video/mp4'` |
| 4 | `initUpload` | `buildVideoKey(userId, videoId, filename)` — builds a unique S3 object key from that same `videoId` |
| 5 | `videoModels.js` | `createVideoService(videoId, ...)` → `INSERT INTO videos ... status = 'pending'`, using `videoId` as the `UUID` primary key |
| 6 | `s3.js` | `generateUploadUrl(key, contentType)` — presigned S3 `PUT` URL, 15 min default expiry |
| 7 | Controller | Returns `201` with `{ videoId, uploadUrl }` — the same `videoId` used for the S3 key and the DB row |

**Client then uploads the file directly to S3 using `uploadUrl`** — it never passes through this server.

## Complete upload — `POST /videos/:id/complete`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends `Authorization: Bearer <accessToken>` after the S3 upload succeeds |
| 2 | `authenticate` | Verifies JWT, sets `req.user` |
| 3 | `videoModels.js` | `findVideoById(id)` |
| 4 | — | If missing or not owned by `req.user.userId` → `404 Video not found` |
| 5 | — | If `status !== 'pending'` → `409 Upload already completed` |
| 6 | `videoModels.js` | `markVideoUploaded(id)` → `status = 'uploaded'`, `uploaded_at = now()` |
| 7 | Controller | Returns `200` with the updated video row |

## Notes

- This service does not verify the file actually landed in S3 on `complete` — it
  trusts the client's signal. Adding an S3 `HeadObject` check (or S3 event
  notifications) would close that gap.
- `videos.user_id` is a plain integer, not a foreign key — the video service owns
  a separate database from the auth service, so there's no cross-service FK.
