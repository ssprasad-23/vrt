import pool from '../config/configDB.js'

// Returns true if a new block was added, false if it already existed.
export const blockUser = async (blockerId, blockedId) => {
    const result = await pool.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [blockerId, blockedId]
    )
    return result.rowCount > 0
}

// Returns true if a block was removed, false if there wasn't one.
export const unblockUser = async (blockerId, blockedId) => {
    const result = await pool.query(
        `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
        [blockerId, blockedId]
    )
    return result.rowCount > 0
}

// The users this user has blocked, most recent first.
export const getBlockedUsers = async (blockerId) => {
    const result = await pool.query(
        `SELECT blocked_id, created_at
         FROM user_blocks
         WHERE blocker_id = $1
         ORDER BY created_at DESC`,
        [blockerId]
    )
    return result.rows
}

// True if this user has blocked anyone. Their feed then differs from everyone else's, so it
// can't be served from the shared first-page cache. (Being blocked doesn't change your feed.)
export const hasAnyBlocks = async (userId) => {
    const result = await pool.query(
        `SELECT EXISTS (
            SELECT 1 FROM user_blocks WHERE blocker_id = $1
         ) AS has_blocks`,
        [userId]
    )
    return result.rows[0].has_blocks
}
