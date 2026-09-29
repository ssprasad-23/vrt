import pool from '../config/configDB.js'

export const createTranscodeJob = async (videoId, sourceKey, settings) => {
    const result = await pool.query(
      `INSERT INTO transcode_jobs (video_id, source_key, settings, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [videoId, sourceKey, settings])
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

// Records one finished encode (e.g. name 'h264') in the job's outputs map, merged with any
// already there — so a retry after a partial failure knows which outputs to skip.
export const saveTranscodeOutput = async (videoId, name, outputKey) => {
    const result = await pool.query(
        `UPDATE transcode_jobs
         SET outputs = outputs || jsonb_build_object($2::text, $3::text)
         WHERE video_id = $1
         RETURNING *`,
        [videoId, name, outputKey]
    )
    return result.rows[0]
}

// Marks the job done once every output is saved (see saveTranscodeOutput).
export const markTranscodeCompleted = async (videoId) => {
    const result = await pool.query(
        `UPDATE transcode_jobs
         SET status = 'completed', error_message = NULL, completed_at = now()
         WHERE video_id = $1
         RETURNING *`,
        [videoId]
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
