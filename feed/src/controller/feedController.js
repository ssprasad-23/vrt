import { getFeedPage } from "../models/feedModels.js"
import { encodeCursor, decodeCursor } from "../utility/cursor.js"

//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}

const DEFAULT_PAGE_SIZE = 3
const MAX_PAGE_SIZE = 20

// GET /feed?limit=3&cursor=<nextCursor from the previous page>
// Returns { videos, nextCursor }. nextCursor is null once there's nothing more to load.
export const getFeed = async (req, res, next) => {
    const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(req.query.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        return handleResponse(res, 400, `limit must be an integer between 1 and ${MAX_PAGE_SIZE}`)
    }

    let cursor = null
    if (req.query.cursor) {
        cursor = decodeCursor(req.query.cursor)
        if (!cursor) return handleResponse(res, 400, "Invalid cursor")
    }

    try {
        // fetch one extra row to know whether another page exists without a COUNT query
        const rows = await getFeedPage(limit + 1, cursor)
        const hasMore = rows.length > limit
        const page = hasMore ? rows.slice(0, limit) : rows

        const videos = page.map(row => ({
            videoId: row.video_id,
            userId: row.user_id,
            // H.264 key within the public media bucket — the client builds the playable URL from it
            videoKey: row.h264_s3_key,
            // every encoded version, so a client that can decode AV1 in hardware may pick it
            // (av1 is null until its slower encode finishes)
            videoKeys: { h264: row.h264_s3_key, av1: row.av1_s3_key },
            description: row.description,
            category: row.category,
            createdAt: row.created_at,
        }))

        const last = page[page.length - 1]
        const nextCursor = hasMore ? encodeCursor(last.cursor_created_at, last.video_id) : null

        handleResponse(res, 200, "Feed fetched", { videos, nextCursor })
    } catch (err) {
        next(err)
    }
}
