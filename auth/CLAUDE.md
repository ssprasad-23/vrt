# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Express 5 REST API using ES modules (`"type": "module"` — use `import`/`export` throughout).

**Request flow**: `server.js` → `src/routes/authRouters.js` → `src/controller/authController.js` → `src/models/authModels.js` → `src/config/configDB.js` (the shared `pg.Pool`). Routes are mounted at `/` in `server.js`, so paths are defined by the router itself (currently `POST /userSignUp`, `POST /userLogin`, `POST /refreshToken`, `POST /logout`).

**Startup sequence** (`server.js`): verifies DB connectivity with `SELECT 1`, calls `initDb()` (`src/data/createTable.js`) to create the `users` and `refresh_tokens` tables if absent, then starts the HTTP server. A centralized error-handling middleware (last `app.use` in `server.js`) catches anything passed to `next(err)` from controllers and responds with a generic 500.

**Database** (`src/config/configDB.js`): exports a single `pg.Pool` instance. All queries use this pool. Configured via `.env`: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, plus `PORT` for the HTTP server.

**Schema** (`src/data/userTable.sql`): `users` table with a `BEFORE UPDATE` trigger that auto-sets `updated_at`. `initDb()` checks for table existence before running the SQL (idempotent).

**Response shape**: `authController.js` uses a `handleResponse(res, status, message, data)` helper — controllers should keep using this for consistency rather than calling `res.json` directly.

## Services

Single-service repo — no microservices split yet.

| Service | Path | Port | Language/Runtime | Depends on | Owns data |
|---|---|---|---|---|---|
| auth service | repo root, entry `server.js` | `PORT` (from `.env`) | Node.js, ES modules, Express 5 | PostgreSQL via `pg.Pool` (`src/config/configDB.js`) | `users`, `refresh_tokens` tables |

## Data flow for key use cases

**Signup** (`POST /userSignUp`): `authRouters.js` → `createUser` (`authController.js`) → `createUserService` (`authModels.js`) → `INSERT INTO users` → `201` with the created row, or `409` on unique-violation (`23505`).

**Login** (`POST /userLogin`): `loginUser` → `loginUserService` looks up the row by username/password → on match, `src/utility/tokens.js` mints an access token (15m default; payload `{ sub: <user_id> }` only, HS256, `iss: 'vrt-auth'`, `aud: 'vrt-api'` — the gateway verifies all three) and a refresh token (32 random bytes, not a JWT) → only its SHA-256 hash is persisted via `storeRefreshToken` (`refresh_tokens` table, new `family_id` per login) and the raw token is set as an `httpOnly` cookie (`REFRESH_TOKEN_TTL_DAYS`, default 30) → access token returned in the JSON body.

**Refresh** (`POST /refreshToken`): reads the refresh token cookie → `rotateRefreshToken` (one transaction) marks it used and stores a new token in the same family → the new token replaces the cookie with a fresh 30-day expiry (sliding) and a new access token is returned. Refresh tokens are single-use: presenting an already-used one is treated as theft and `deleteRefreshTokenFamily` revokes that login session. Logout also deletes the whole family. `server.js`'s `initDb()` recreates an old-format `refresh_tokens` table (raw `token` column) on boot, logging everyone out once.

Full step-by-step tables (including logout) live in `AUTH_FLOW.md`.

## Event/message contracts

None — this repo has no message queue or pub/sub broker (no Kafka/RabbitMQ/Redis pub-sub deps in `package.json`). All communication is synchronous HTTP request/response.

## Where things live

- Route definitions → `src/routes/authRouters.js`
- Request handling / response shaping → `src/controller/authController.js`
- DB queries (users + refresh tokens) → `src/models/authModels.js`
- DB connection pool → `src/config/configDB.js`
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/userTable.sql` and `src/data/refreshTokenTable.sql`
- Access-token JWT signing/verification, refresh-token generation/hashing, TTLs → `src/utility/tokens.js`
- Bearer-token auth middleware (not yet wired to any route) → `src/middlewear/authenticate.js`
- Server bootstrap, DB health check, global error handler → `server.js`

## Local dev / run instructions

Requires a running PostgreSQL instance and a `.env` file with: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`, `ACCESS_TOKEN_SECRET` (optionally `ACCESS_TOKEN_EXPIRY`, default `15m`, and `REFRESH_TOKEN_TTL_DAYS`, default `30`; refresh tokens are random, so there's no refresh secret). Then:

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

`server.js` creates the `users` and `refresh_tokens` tables on boot if they don't already exist — no separate migration step needed.

## Known issues

- None currently tracked. Passwords are hashed with `bcrypt` (`SALT_ROUNDS = 10`) in `createUserService`/`loginUserService` (`src/models/authModels.js`).