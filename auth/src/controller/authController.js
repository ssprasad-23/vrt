import {
    createUserService,
    loginUserService,
    storeRefreshToken,
    findRefreshToken,
    deleteRefreshToken,
    findUserById } from "../models/authModels.js"
import { generateAccessToken,
         generateRefreshToken,
         verifyRefreshToken } from '../utility/tokens.js';


//Standardise response function
const handleResponse = (res, status, message, data=null) => {
    res.status(status).json({
        status,
        message,
        data
    })
}

//signup
export const createUser = async (req, res, next) => {
    const { username, email, password, dob, phone_number, country } = req.body
    try {
        const signUp = await createUserService(username, email, password, dob, phone_number, country)
        handleResponse(res, 201, "User created successfully", signUp)
        console.log("User created successfully", new Date().toLocaleTimeString())
    } catch (err) {
        if (err.code === '23505') {  // PostgreSQL unique violation code
            return handleResponse(res, 409, "Error Creating User")
        }
        next(err)
    }
}

// 7 days in ms — keep in sync with the REFRESH_TOKEN_EXPIRY default in tokens.js
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

//login
export const loginUser = async (req, res, next) => {
    const { username, password } = req.body
    try {
        const user = await loginUserService(username, password)
        if (!user) {
            return handleResponse(res, 401, "Invalid username or password")
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
        await storeRefreshToken(user.user_id, refreshToken, expiresAt);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });

        handleResponse(res, 200, 'Login successful', { accessToken })
    } catch (err) {
        next(err)
    }
}

// refresh token
export const refreshTokenController = async (req, res, next) => {
    const token = req.cookies?.refreshToken
    if (!token) {
        return handleResponse(res, 401, "No refresh token provided")
    }
    try {
        const stored = await findRefreshToken(token)
        if (!stored || new Date(stored.expires_at) < new Date()) {
            return handleResponse(res, 403, "Invalid or expired refresh token")
        }

        const payload = verifyRefreshToken(token)
        const user = await findUserById(payload.userId)
        if (!user) {
            return handleResponse(res, 403, "Invalid or expired refresh token")
        }
        const accessToken = generateAccessToken(user)

        handleResponse(res, 200, "Access token refreshed", { accessToken })
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return handleResponse(res, 403, "Invalid or expired refresh token")
        }
        next(err)
    }
}

// logout
export const logoutController = async (req, res, next) => {
    const token = req.cookies?.refreshToken
    try {
        if (token) {
            await deleteRefreshToken(token)
            console.log("Refresh token deleted", new Date().toLocaleTimeString())
        }
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
        })
        handleResponse(res, 200, "Logged out successfully")
        console.log("Logged out successfully", )
    } catch (err) {
        next(err)
    }
}