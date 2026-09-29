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

export const markVideoUploaded = async (videoId) => {
    const result = await pool.query(
        `UPDATE videos
         SET status = 'uploaded', uploaded_at = now()
         WHERE video_id = $1
         RETURNING *`,
        [videoId]
    )
    return result.rows[0]
}

// Column each transcode output's key is saved in. A whitelist, so the codec from an SQS
// message never ends up in the SQL itself.
export const ENCODED_KEY_COLUMNS = {
    h264: 'h264_s3_key',
    av1: 'av1_s3_key',
}

// Saves one encoded file's key (media bucket) once the transcode service reports that output done.
export const setEncodedKey = async (videoId, codec, key) => {
    const column = ENCODED_KEY_COLUMNS[codec]
    if (!column) throw new Error(`Unknown codec: ${codec}`)
    const result = await pool.query(
        `UPDATE videos
         SET ${column} = $2
         WHERE video_id = $1
         RETURNING *`,
        [videoId, key]
    )
    return result.rows[0]
}
