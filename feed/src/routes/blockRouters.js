import express from "express"
import { authenticate } from "../middleware/authenticate.js"
import { createBlock, deleteBlock, listBlocks } from "../controller/blockController.js"

const router = express.Router()

router.get("/blocks", authenticate, listBlocks)
router.post("/blocks/:userId", authenticate, createBlock)
router.delete("/blocks/:userId", authenticate, deleteBlock)

export default router
