import pool from '../config/configDB.js'

export const createVideoService = async (videoId, userId, originalS3Key, originalFilename, contentType, description, category) => {
    const result = await pool.query(
      `INSERT INTO videos (video_id, user_id, original_s3_key, original_filename, content_type, description, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [videoId, userId, originalS3Key, originalFilename, contentType, description, category])
    return result.rows[0]
}

export const findVideoById = async (videoId) => {
    const result = await pool.query(
        'SELECT * FROM videos WHERE video_id = $1', [videoId]
    )
    return result.rows[0]
}

export const markVideoUploaded = async (videoId, originalSizeMb) => {
    const result = await pool.query(
        `UPDATE videos
         SET status = 'uploaded', uploaded_at = now(), original_size_mb = $2
         WHERE video_id = $1
         RETURNING *`,
        [videoId, originalSizeMb]
    )
    return result.rows[0]
}

// Marks a video failed with a reason the app can show. Only moves forward from pending/uploaded,
// so a late failure report can't un-publish a video that's already ready.
export const markVideoFailed = async (videoId, reason) => {
    const result = await pool.query(
        `UPDATE videos
         SET status = 'failed', failure_reason = $2
         WHERE video_id = $1 AND status IN ('pending', 'uploaded')
         RETURNING *`,
        [videoId, reason]
    )
    return result.rows[0]
}

// Columns each transcode output's key and size (MB) are saved in. A whitelist, so the codec from
// an SQS message never ends up in the SQL itself.
export const ENCODED_KEY_COLUMNS = {
    h264: { key: 'h264_s3_key', sizeMb: 'h264_size_mb' },
    av1: { key: 'av1_s3_key', sizeMb: 'av1_size_mb' },
}

// Saves one encoded file's key (media bucket) and size in MB once the transcode service reports
// that output done.
export const setEncodedKey = async (videoId, codec, key, sizeMb) => {
    const columns = ENCODED_KEY_COLUMNS[codec]
    if (!columns) throw new Error(`Unknown codec: ${codec}`)
    const result = await pool.query(
        // the H.264 output is what the feed plays, so its arrival makes the video ready
        `UPDATE videos
         SET ${columns.key} = $2, ${columns.sizeMb} = $3,
             status = CASE WHEN $4::boolean AND status = 'uploaded' THEN 'ready' ELSE status END
         WHERE video_id = $1
         RETURNING *`,
        [videoId, key, sizeMb, codec === 'h264']
    )
    return result.rows[0]
}
