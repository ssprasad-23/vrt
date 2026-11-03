# Auth Service Sequence

Based on `authRouters.js` → `authController.js` → `authModels.js` / `tokens.js`.

## Signup — `POST /userSignUp`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends `{ username, email, password, dob, phone_number, country }` |
| 2 | `createUser` | Calls `createUserService()` |
| 3 | `authModels.js` | `bcrypt.hash(password, SALT_ROUNDS)` then `INSERT INTO users ...` |
| 4 | Controller | Returns `201` with created user row |
| 5 | Controller | On unique-violation (`23505`) → `409 Error Creating User` |

No tokens issued here.

## Login — `POST /userLogin`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends `{ username, password }` |
| 2 | `loginUser` | Calls `loginUserService()` → looks up by username, then `bcrypt.compare(password, user.password)` |
| 3 | — | If no match → `401 Invalid username or password` |
| 4 | `authModels.js` | `deleteExpiredRefreshTokens()` — housekeeping |
| 5 | `tokens.js` | `generateAccessToken(user)` — JWT `{ sub }`, HS256, `iss: vrt-auth`, `aud: vrt-api`, 15m default |
| 6 | `tokens.js` | `generateRefreshToken()` — 32 random bytes (base64url), **not** a JWT |
| 7 | `authModels.js` | `storeRefreshToken(userId, sha256(token), newFamilyId, expiresAt)` — only the hash is stored; a new login starts a new family |
| 8 | Controller | Sets the raw refresh token as an `httpOnly` cookie (`maxAge` = `REFRESH_TOKEN_TTL_DAYS`, default 30) |
| 9 | Controller | Returns `200` with `{ accessToken }` in body |

## Refresh — `POST /refreshToken` (rotates)

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends refresh token via cookie (no body needed) |
| 2 | Controller | If cookie missing → `401 No refresh token provided` |
| 3 | `authModels.js` | `rotateRefreshToken(oldHash, newHash, expiresAt)` — one transaction: marks the old token used (`WHERE used_at IS NULL AND expires_at > now()`) and inserts a new token in the same family |
| 4 | — | If nothing was rotated and the token exists with `used_at` set → **reuse detected**: `deleteRefreshTokenFamily()` revokes that login session |
| 5 | — | Unknown / expired / reused → clear cookie, `403 Invalid or expired refresh token` |
| 6 | `authModels.js` | `findUserById(old.user_id)`; if user gone → `403` |
| 7 | Controller | Sets the **new** refresh token cookie (fresh 30-day expiry — sliding) |
| 8 | Controller | Returns `200` with a new `{ accessToken }` |

Every refresh token is single-use. Used rows are kept until they expire so a replay is recognised as reuse.

## Logout — `POST /logout`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends refresh token via cookie |
| 2 | `authModels.js` | `findRefreshToken(sha256(token))`, then `deleteRefreshTokenFamily()` — removes that device's whole session |
| 3 | Controller | `res.clearCookie('refreshToken', ...)` |
| 4 | Controller | Returns `200 Logged out successfully` |

## Password reset — `POST /forgotPassword` → `POST /verifyResetCode` → `POST /resetPassword`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | `POST /forgotPassword { email }` |
| 2 | `forgotPassword` | `findUserByEmail()`. If found and under the per-user limits (60s cooldown, 5 codes/hour via `getResetCodeStats()`): `generateResetCode()` (6 digits, `crypto.randomInt`), `createResetCode()` stores `HMAC-SHA256(RESET_CODE_SECRET, code)` with a 10-minute expiry and kills older unused codes, then `sendResetCodeEmail()` (Resend; logs the code if `RESEND_API_KEY` is unset), not awaited |
| 3 | Controller | Always `200 If that email is registered...` — unknown email or limit hit look the same |
| 4 | Client | `POST /verifyResetCode { email, code }` |
| 5 | `authModels.js` | `claimResetCodeAttempt()` — atomically uses one of 5 guesses on the live code; none left / expired / no code → `400 Invalid or expired code` |
| 6 | Controller | Wrong code → same `400`. Right code → `markResetCodeVerified()` stores `sha256(resetToken)` (10 min) and returns `200 { resetToken }`; the code can't be entered again |
| 7 | Client | `POST /resetPassword { resetToken, newPassword }` (same password rules as signup) |
| 8 | `authModels.js` | `resetPasswordWithToken()` — one transaction: spends the token, `UPDATE users SET password = bcrypt(newPassword)`, deletes all the user's refresh tokens (logged out everywhere) |
| 9 | Controller | `200 Password updated...`, or `400` for an unknown/spent/expired token |

Per-IP limits on these three endpoints are applied in the gateway (`gateway/src/middleware/rateLimit.js`). Access tokens already issued stay valid until they expire (15m).

## Notes

- No route currently uses `verifyAccessToken` from `tokens.js` — the gateway verifies access tokens; `src/middleware/` isn't wired to any route.
- `deleteAllRefreshTokensForUser` ("log out everywhere") exists but no route calls it yet (password reset does the same delete inside its own transaction).
