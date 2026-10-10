import { getFeedPage } from "../models/feedModels.js"
import { encodeCursor, decodeCursor } from "../utility/cursor.js"
import redis from "../config/redisConfig.js"
import { log, logError } from "../utility/logger.js"

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

// The first page (no cursor, default limit) is the same for every user and requested on
// every app open, so it's cached in Redis. Later pages aren't. See redis/README.md.
const FEED_FIRST_PAGE_KEY = "feed:first"
const FEED_FIRST_PAGE_TTL_SECONDS = 30

// Returns the cached first page, null on a miss, or undefined if Redis is unavailable.
const readFirstPageCache = async () => {
    if (!redis.isReady) return undefined
    try {
        const cached = await redis.get(FEED_FIRST_PAGE_KEY)
        return cached ? JSON.parse(cached) : null
    } catch (err) {
        logError("Redis read failed:", err.message || err.code)
        return undefined
    }
}

// Never throws — called without await after the response is sent.
const writeFirstPageCache = async (data) => {
    try {
        await redis.set(FEED_FIRST_PAGE_KEY, JSON.stringify(data), { EX: FEED_FIRST_PAGE_TTL_SECONDS })
        log(`Redis SET: cached first feed page from Postgres in ${FEED_FIRST_PAGE_KEY} (${data.videos.length} videos, expires in ${FEED_FIRST_PAGE_TTL_SECONDS}s)`)
    } catch (err) {
        logError("Redis SET failed:", err.message || err.code)
    }
}

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

    const cacheable = !cursor && limit === DEFAULT_PAGE_SIZE

    try {
        // X-Cache: HIT = served from Redis, MISS = from Postgres and now cached,
        // BYPASS = Redis unavailable, from Postgres. Uncacheable pages get no header.
        let cacheStatus
        if (cacheable) {
            const cached = await readFirstPageCache()
            if (cached) {
                log(`Redis HIT: first feed page served from cache (${cached.videos.length} videos, key ${FEED_FIRST_PAGE_KEY})`)
                res.set("X-Cache", "HIT")
                return handleResponse(res, 200, "Feed fetched", cached)
            }
            cacheStatus = cached === null ? "MISS" : "BYPASS"
            if (cacheStatus === "MISS") {
                log(`Redis MISS: ${FEED_FIRST_PAGE_KEY} not cached, requesting first page from Postgres`)
            } else {
                log("Redis BYPASS: Redis unavailable, serving first feed page from Postgres (not cached)")
            }
        }

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

        const data = { videos, nextCursor }
        if (cacheStatus) res.set("X-Cache", cacheStatus)
        handleResponse(res, 200, "Feed fetched", data)

        // respond first, then cache in the background — the user doesn't wait for the save.
        // An empty feed isn't cached, so the first upload shows up on the next request.
        if (cacheStatus === "MISS") {
            if (videos.length) writeFirstPageCache(data)
            else log(`Redis SET skipped: feed is empty, nothing to cache in ${FEED_FIRST_PAGE_KEY}`)
        }
    } catch (err) {
        next(err)
    }
}
