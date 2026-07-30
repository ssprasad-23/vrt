import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { initUpload, completeUpload } from "../controller/videoController.js"

const router = express.Router()

router.post("/videos/upload-init", authenticate, initUpload)
router.post("/videos/:id/complete", authenticate, completeUpload)

export default router
