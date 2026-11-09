import { blockUser, unblockUser, getBlockedUsers } from "../models/blockModels.js"

//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}

// Returns the :userId param as a positive integer, or null if it isn't one.
const parseUserId = (param) => {
    const id = Number(param)
    return Number.isInteger(id) && id > 0 ? id : null
}

// POST /blocks/:userId — idempotent: blocking someone twice just says they're already blocked.
// The user id isn't checked against auth's users table (different database); blocking an id
// that doesn't exist is harmless.
export const createBlock = async (req, res, next) => {
    const blockedId = parseUserId(req.params.userId)
    if (!blockedId) return handleResponse(res, 400, "userId must be a positive integer")
    if (blockedId === req.user.userId) return handleResponse(res, 400, "You can't block yourself")

    try {
        const added = await blockUser(req.user.userId, blockedId)
        if (added) return handleResponse(res, 201, "User blocked", { blockedUserId: blockedId })
        handleResponse(res, 200, "User already blocked", { blockedUserId: blockedId })
    } catch (err) {
        next(err)
    }
}

// DELETE /blocks/:userId
export const deleteBlock = async (req, res, next) => {
    const blockedId = parseUserId(req.params.userId)
    if (!blockedId) return handleResponse(res, 400, "userId must be a positive integer")

    try {
        const removed = await unblockUser(req.user.userId, blockedId)
        if (!removed) return handleResponse(res, 404, "User is not blocked")
        handleResponse(res, 200, "User unblocked", { blockedUserId: blockedId })
    } catch (err) {
        next(err)
    }
}

// GET /blocks — the caller's block list, for a settings screen.
export const listBlocks = async (req, res, next) => {
    try {
        const rows = await getBlockedUsers(req.user.userId)
        const blockedUsers = rows.map(row => ({ userId: row.blocked_id, blockedAt: row.created_at }))
        handleResponse(res, 200, "Blocked users fetched", { blockedUsers })
    } catch (err) {
        next(err)
    }
}
