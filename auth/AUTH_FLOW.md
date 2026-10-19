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

## Notes

- No route currently uses `verifyAccessToken` from `tokens.js` — the gateway verifies access tokens; `src/middlewear/` isn't wired to any route.
- `deleteAllRefreshTokensForUser` ("log out everywhere") exists but no route calls it yet.
