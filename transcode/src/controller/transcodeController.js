import { findTranscodeJobById } from "../models/transcodeModels.js"
import { generateDownloadUrl } from '../utility/s3.js';
import { ensureTranscodeJob, runTranscodeJob } from '../services/transcodeService.js';

//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}

// POST /transcode
// Manual/testing entry point — once the BullMQ producer (upload service) exists,
// { videoId, url } jobs on the av1-transcode queue drive this same pipeline via
// src/worker/transcodeWorker.js instead.
export const startTranscode = async (req, res, next) => {
    const { videoId, sourceUrl } = req.body

    if (!videoId || !sourceUrl) {
        return handleResponse(res, 400, "videoId and sourceUrl are required")
    }

    try {
        const existing = await findTranscodeJobById(videoId)
        if (existing) {
            return handleResponse(res, 409, "A transcode job already exists for this video")
        }

        const { job } = await ensureTranscodeJob(videoId, sourceUrl)

        // fire-and-forget: the caller polls GET /transcode/:videoId for progress.
        // runTranscodeJob records failures on the job row itself, so a rejection here is just logged.
        runTranscodeJob(videoId).catch((err) => {
            console.error(`Transcode job ${videoId} failed:`, err);
        });

        handleResponse(res, 202, "Transcode job started", job)
    } catch (err) {
        next(err)
    }
}

// GET /transcode/:videoId
export const getTranscodeStatus = async (req, res, next) => {
    const { videoId } = req.params
    try {
        const job = await findTranscodeJobById(videoId)
        if (!job) {
            return handleResponse(res, 404, "Transcode job not found")
        }

        let downloadUrl = null
        if (job.status === 'completed' && job.output_key) {
            downloadUrl = await generateDownloadUrl(job.output_key)
        }

        handleResponse(res, 200, "Transcode job status", { ...job, downloadUrl })
    } catch (err) {
        next(err)
    }
}
