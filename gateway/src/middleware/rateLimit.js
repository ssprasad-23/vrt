import { rateLimit } from "express-rate-limit"

// Per-IP limits for auth's password reset endpoints, so one client can't flood inboxes (and our
// Resend quota) or brute-force codes across many accounts. auth adds per-account limits on top
// (60s cooldown and 5 codes/hour per user, 5 guesses per code).
//
// Counts live in this process's memory: they reset on restart and aren't shared between gateway
// instances. Fine for one instance; with several, switch to a shared store such as Redis.
// Keyed on IP only, never the body — the gateway doesn't parse bodies (see server.js).
const limitTo = (limit, windowMinutes) => rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            status: options.statusCode,
            message: "Too many attempts. Please wait a few minutes and try again.",
            data: null,
        })
    },
})

export const forgotPasswordLimiter = limitTo(5, 15)
export const verifyResetCodeLimiter = limitTo(10, 15)
export const resetPasswordLimiter = limitTo(10, 15)
