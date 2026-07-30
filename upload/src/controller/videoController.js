import { v4 as uuidv4 } from 'uuid';
import { createVideoService, findVideoById, markVideoUploaded } from "../models/videoModels.js"
import { buildVideoKey, generateUploadUrl } from '../utility/s3.js';

//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}


// POST /videos/upload-init
const DEFAULT_CONTENT_TYPE = 'video/mp4'

export const initUpload = async (req, res, next) => {
    const { description, category } = req.body
    const userId = req.user.userId

    if (!description || !category) {
        return handleResponse(res, 400, "description and category are required")
    }
    try {
        // one id, used for both the S3 key and the DB row
        const videoId = uuidv4()
        const contentType = DEFAULT_CONTENT_TYPE
        const filename = `${videoId}.mp4`

        //build s3 object key
        const s3Key = buildVideoKey(userId, videoId, filename)

        //insert a pending video in postgres
        const video = await createVideoService(videoId, userId, s3Key, filename, contentType, description, category)

        //generate a presigned s3 upload URL for that key
        const uploadUrl = await generateUploadUrl(s3Key, contentType)

        handleResponse(res, 201, "Upload initialized", { videoId: video.video_id, uploadUrl })
    } catch (err) {
        next(err)
    }
}


// POST /videos/:id/complete
export const completeUpload = async (req, res, next) => {
    const { id } = req.params
    const userId = req.user.userId
    try {
        const video = await findVideoById(id)
        if (!video || video.user_id !== userId) {
            return handleResponse(res, 404, "Video not found")
        }
        if (video.status !== 'pending') {
            return handleResponse(res, 409, "Upload already completed")
        }

        const updated = await markVideoUploaded(id)
        handleResponse(res, 200, "Upload marked complete", updated)
    } catch (err) {
        next(err)
    }
}
