import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { initUpload, completeUpload, getVideoStatus, listMyVideos, deleteVideo } from "../controller/videoController.js"

const router = express.Router()

// GET    /videos              List the caller's own videos, newest first, with thumbnail and playback keys (My Videos screen)
// POST   /videos/upload-init  Create a pending video row and return a presigned URL to upload the file straight to S3
// POST   /videos/:id/complete Confirm the file landed (and is under the size limit), then queue it for transcoding
// GET    /videos/:id          One of the caller's videos' status (pending/uploaded/ready/failed), polled after an upload
// DELETE /videos/:id          Delete one of the user's finished videos: its row and all its files in both buckets

router.get("/videos", authenticate, listMyVideos)
router.post("/videos/upload-init", authenticate, initUpload)
router.post("/videos/:id/complete", authenticate, completeUpload)
router.get("/videos/:id", authenticate, getVideoStatus)
router.delete("/videos/:id", authenticate, deleteVideo)

export default router
