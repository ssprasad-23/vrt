import pool from '../config/configDB.js'

export const createTranscodeJob = async (videoId, sourceUrl, settings) => {
    const result = await pool.query(
      `INSERT INTO transcode_jobs (video_id, source_url, settings, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [videoId, sourceUrl, settings])
    return result.rows[0]
}

export const findTranscodeJobById = async (videoId) => {
    const result = await pool.query(
        'SELECT * FROM transcode_jobs WHERE video_id = $1', [videoId]
    )
    return result.rows[0]
}

export const markTranscodeProcessing = async (videoId) => {
    const result = await pool.query(
        `UPDATE transcode_jobs
         SET status = 'processing', started_at = now()
         WHERE video_id = $1
         RETURNING *`,
        [videoId]
    )
    return result.rows[0]
}

export const markTranscodeCompleted = async (videoId, outputKey) => {
    const result = await pool.query(
        `UPDATE transcode_jobs
         SET status = 'completed', output_key = $2, completed_at = now()
         WHERE video_id = $1
         RETURNING *`,
        [videoId, outputKey]
    )
    return result.rows[0]
}

export const markTranscodeFailed = async (videoId, errorMessage) => {
    const result = await pool.query(
        `UPDATE transcode_jobs
         SET status = 'failed', error_message = $2, completed_at = now()
         WHERE video_id = $1
         RETURNING *`,
        [videoId, errorMessage]
    )
    return result.rows[0]
}
