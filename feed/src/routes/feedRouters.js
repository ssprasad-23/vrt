import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { getFeed } from "../controller/feedController.js"

const router = express.Router()

router.get("/feed", authenticate, getFeed)

export default router
