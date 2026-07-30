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
| 4 | `tokens.js` | `generateAccessToken(user)` — JWT, 15m default, signed w/ `ACCESS_TOKEN_SECRET` |
| 5 | `tokens.js` | `generateRefreshToken(user)` — JWT, 7d default, signed w/ `REFRESH_TOKEN_SECRET` |
| 6 | `authModels.js` | `storeRefreshToken(userId, token, expiresAt)` → `INSERT INTO refresh_tokens` |
| 7 | Controller | Sets refresh token as `httpOnly` cookie (`maxAge` 7d) |
| 8 | Controller | Returns `200` with `{ accessToken }` in body |

**Issued here:** access token (body) + refresh token (cookie), both minted fresh; refresh token also persisted in DB.

## Refresh — `POST /refreshToken`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends refresh token via cookie (no body needed) |
| 2 | Controller | If cookie missing → `401 No refresh token provided` |
| 3 | `authModels.js` | `findRefreshToken(token)` — DB lookup |
| 4 | — | If not found or `expires_at` passed → `403 Invalid or expired refresh token` |
| 5 | `tokens.js` | `verifyRefreshToken(token)` — JWT signature/expiry check |
| 6 | `authModels.js` | `findUserById(payload.userId)` |
| 7 | — | If user gone → `403` |
| 8 | `tokens.js` | `generateAccessToken(user)` — **new** access token only |
| 9 | Controller | Returns `200` with `{ accessToken }` |

**Issued here:** only a new access token. Refresh token is *not* rotated — same one stays valid until its own expiry or logout.

## Logout — `POST /logout`

| Step | Actor | Action |
|---|---|---|
| 1 | Client | Sends refresh token via cookie |
| 2 | `authModels.js` | `deleteRefreshToken(token)` — removes row from `refresh_tokens` |
| 3 | Controller | `res.clearCookie('refreshToken', ...)` |
| 4 | Controller | Returns `200 Logged out successfully` |

## Notes

- No route currently uses `verifyAccessToken` from `tokens.js` — there's a `src/middlewear/` folder but nothing in `authRouters.js` wires an auth-check middleware onto a protected route yet.
- Refresh flow doesn't rotate the refresh token on use — same token persists until 7-day expiry or explicit logout.
- Passwords are hashed with `bcrypt` (`SALT_ROUNDS = 10`) before storage — not plaintext.