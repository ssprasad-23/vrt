import express from "express"
import { createProxyMiddleware } from "http-proxy-middleware"
import { authenticate } from "../middleware/authenticate.js"
import { attachProxyHeaders } from "../utility/proxyHeaders.js"
import { SERVICE_TARGETS } from "../config/services.js"

const router = express.Router()

// auth's own routes (/userSignUp, /userLogin, /refreshToken, /logout) aren't
// prefixed with /auth and don't require an access token (you don't have one yet
// for signup/login, and refresh/logout use the httpOnly refresh-token cookie
// instead) — so no authenticate here. No pathRewrite needed either: Express's
// router.use("/auth", ...) already strips the /auth prefix before the proxy sees it,
// which happens to be exactly the path auth's own router expects.
router.use("/auth", createProxyMiddleware({
    target: SERVICE_TARGETS.auth,
    changeOrigin: true,
}))

// videos/* requires a valid access token. authenticate() verifies it once here;
// attachProxyHeaders forwards the decoded identity + a shared secret so the
// downstream service can trust it instead of re-verifying the JWT.
//
// Express's router.use(mountPath, ...) strips the mount path from req.url before
// the proxy ever sees it, but upload's own router expects the full path
// (e.g. /videos/upload-init, not just /upload-init) — pathRewrite adds it back.
router.use("/videos", authenticate, createProxyMiddleware({
    target: SERVICE_TARGETS.upload,
    changeOrigin: true,
    pathRewrite: (path) => `/videos${path}`,
    on: { proxyReq: attachProxyHeaders },
}))

export default router
