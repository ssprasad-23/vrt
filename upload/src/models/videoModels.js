import pool from '../config/configDB.js'

export const createVideoService = async (videoId, userId, s3Key, originalFilename, contentType, description, category) => {
    const result = await pool.query(
      `INSERT INTO videos (video_id, user_id, s3_key, original_filename, content_type, description, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [videoId, userId, s3Key, originalFilename, contentType, description, category])
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
