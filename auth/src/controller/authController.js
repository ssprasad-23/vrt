import crypto from "crypto"
import {
    createUserService,
    loginUserService,
    storeRefreshToken,
    rotateRefreshToken,
    findRefreshToken,
    deleteRefreshTokenFamily,
    deleteExpiredRefreshTokens,
    findUserById } from "../models/authModels.js"
import { generateAccessToken,
         generateRefreshToken,
         hashRefreshToken,
         refreshTokenExpiresAt,
         REFRESH_TOKEN_MAX_AGE_MS } from '../utility/tokens.js';
import { log, logError } from "../utility/logger.js"
import { validateSignup, validateLogin, normalizePhone } from "../utility/validation.js"


//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}

// Unique indexes on users (see src/data/createTable.js) -> what to tell the client on a clash
const DUPLICATE_MESSAGES = {
    users_username_lower_key: "Username is already taken",
    users_email_lower_key: "An account with this email already exists",
}

//signup
export const createUser = async (req, res, next) => {
    const invalid = validateSignup(req.body ?? {})
    if (invalid) {
        return handleResponse(res, 400, invalid)
    }
    const { username, email, password, dob, phone_number, country } = req.body
    try {
        const signUp = await createUserService(
            username.trim(),
            email.trim().toLowerCase(),
            password,
            dob,
            normalizePhone(phone_number) || null,
            country.trim(),
        )
        handleResponse(res, 201, "User created successfully", signUp)
        log("User created successfully")
    } catch (err) {
        if (err.code === '23505') {  // PostgreSQL unique violation code
            return handleResponse(res, 409, DUPLICATE_MESSAGES[err.constraint] || "Account already exists")
        }
        next(err)
    }
}

const REFRESH_COOKIE = 'refreshToken'
const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
}

const setRefreshCookie = (res, token) => {
    res.cookie(REFRESH_COOKIE, token, { ...REFRESH_COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE_MS })
}

const clearRefreshCookie = (res) => {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS)
}

//login
export const loginUser = async (req, res, next) => {
    const invalid = validateLogin(req.body ?? {})
    if (invalid) {
        return handleResponse(res, 400, invalid)
    }
    const { username, password } = req.body
    try {
        const user = await loginUserService(username, password)
        if (!user) {
            return handleResponse(res, 401, "Invalid username or password")
        }

        // housekeeping: drop rows nobody can use any more
        await deleteExpiredRefreshTokens()

        const accessToken = generateAccessToken(user)
        // a new login starts a new family — the chain of tokens this device will rotate through
        const refreshToken = generateRefreshToken()
        await storeRefreshToken(user.user_id, hashRefreshToken(refreshToken), crypto.randomUUID(), refreshTokenExpiresAt())
        setRefreshCookie(res, refreshToken)

        handleResponse(res, 200, 'Login successful', { accessToken })
    } catch (err) {
        next(err)
    }
}

// refresh token — rotates on every call: the presented token is marked used and a new one
// (fresh 30-day expiry) replaces it in the cookie.
export const refreshTokenController = async (req, res, next) => {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (!token) {
        return handleResponse(res, 401, "No refresh token provided")
    }
    try {
        const tokenHash = hashRefreshToken(token)
        const newToken = generateRefreshToken()
        const old = await rotateRefreshToken(tokenHash, hashRefreshToken(newToken), refreshTokenExpiresAt())

        if (!old) {
            // An already-used token coming back means it was copied: either the thief or the real
            // user is replaying it. Revoke that whole login session so neither can keep refreshing.
            const stored = await findRefreshToken(tokenHash)
            if (stored?.used_at) {
                await deleteRefreshTokenFamily(stored.family_id)
                logError(`Refresh token reuse detected for user ${stored.user_id} — session revoked`)
            }
            clearRefreshCookie(res)
            return handleResponse(res, 403, "Invalid or expired refresh token")
        }

        const user = await findUserById(old.user_id)
        if (!user) {
            clearRefreshCookie(res)
            return handleResponse(res, 403, "Invalid or expired refresh token")
        }

        setRefreshCookie(res, newToken)
        handleResponse(res, 200, "Access token refreshed", { accessToken: generateAccessToken(user) })
    } catch (err) {
        next(err)
    }
}

// logout — revokes this device's session (its whole token family)
export const logoutController = async (req, res, next) => {
    const token = req.cookies?.[REFRESH_COOKIE]
    try {
        if (token) {
            const stored = await findRefreshToken(hashRefreshToken(token))
            if (stored) {
                await deleteRefreshTokenFamily(stored.family_id)
                log("Refresh token session deleted")
            }
        }
        clearRefreshCookie(res)
        handleResponse(res, 200, "Logged out successfully")
        log("Logged out successfully")
    } catch (err) {
        next(err)
    }
}
