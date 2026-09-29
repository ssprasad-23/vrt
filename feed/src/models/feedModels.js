import pool from '../config/configDB.js'

// One page of the feed, newest first. Only videos whose H.264 encode is done (h264_s3_key set)
// are returned: H.264 plays on every device, while AV1 (av1_s3_key, may still be encoding)
// needs a hardware AV1 decoder.
//
// Keyset pagination on (created_at, video_id): the cursor is the last row of the
// previous page, so new uploads arriving mid-scroll don't shift pages and cause
// repeats the way OFFSET would. video_id breaks ties between identical timestamps.
// created_at::text keeps full microsecond precision for the next cursor.
export const getFeedPage = async (limit, cursor) => {
    const params = [limit]
    let where = 'h264_s3_key IS NOT NULL'
    if (cursor) {
        params.push(cursor.createdAt, cursor.videoId)
        where += ' AND (created_at, video_id) < ($2::timestamptz, $3)'
    }

    const result = await pool.query(
        `SELECT video_id, user_id, h264_s3_key, av1_s3_key, description, category,
                created_at, created_at::text AS cursor_created_at
         FROM videos
         WHERE ${where}
         ORDER BY created_at DESC, video_id DESC
         LIMIT $1`,
        params
    )
    return result.rows
}
