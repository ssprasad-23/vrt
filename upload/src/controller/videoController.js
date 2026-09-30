import { createVideoService, findVideoById, markVideoUploaded } from "../models/videoModels.js"
import { buildVideoKey, generateUploadUrl, getUploadedSize } from '../utility/s3.js';
import { generateVideoId } from '../utility/videoId.js';
import { sendTranscodeJob } from '../utility/sqs.js';

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
        // videoID used for both the S3 key and the DB row
        const videoId = generateVideoId()
        const contentType = DEFAULT_CONTENT_TYPE
        const filename = `${videoId}.mp4`

        //build s3 object key
        const s3Key = buildVideoKey(videoId)

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

        // the client uploads straight to S3, so confirm the file actually landed before queuing
        // the transcode job — otherwise the worker would pick up a job for a file that isn't there.
        // The row stays 'pending', so the client can finish the upload and retry /complete.
        const uploadedSize = await getUploadedSize(video.original_s3_key)
        if (!uploadedSize) {
            return handleResponse(res, 400, "Upload not found in storage — upload the file before completing")
        }

        // queue the transcode job BEFORE marking uploaded: if the send fails the row stays
        // 'pending', so the client can retry /complete instead of getting stuck on a 409.
        // A duplicate message (send ok, update fails, client retries) is harmless — the
        // transcode worker skips jobs that are already completed.
        await sendTranscodeJob(video.video_id, video.original_s3_key)

        // MB with 1 decimal (e.g. 16.2), same as the size in the encoded files' names
        const originalSizeMb = Number((uploadedSize / (1024 * 1024)).toFixed(1))
        const updated = await markVideoUploaded(id, originalSizeMb)
        handleResponse(res, 200, "Upload marked complete", updated)
    } catch (err) {
        next(err)
    }
}
