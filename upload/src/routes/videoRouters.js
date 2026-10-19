import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { initUpload, completeUpload, getVideoStatus } from "../controller/videoController.js"

const router = express.Router()

router.post("/videos/upload-init", authenticate, initUpload)
router.post("/videos/:id/complete", authenticate, completeUpload)
router.get("/videos/:id", authenticate, getVideoStatus)

export default router
