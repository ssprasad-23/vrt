import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { startTranscode, getTranscodeStatus } from "../controller/transcodeController.js"

const router = express.Router()

router.post("/transcode", authenticate, startTranscode)
router.get("/transcode/:videoId", authenticate, getTranscodeStatus)

export default router
