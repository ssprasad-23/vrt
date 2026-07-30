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

**Login** (`POST /userLogin`): `loginUser` → `loginUserService` looks up the row by username/password → on match, `src/utility/tokens.js` mints an access token (15m default) and a refresh token (7d default) → refresh token is persisted via `storeRefreshToken` (`refresh_tokens` table) and set as an `httpOnly` cookie → access token returned in the JSON body.

**Refresh** (`POST /refreshToken`): reads the refresh token cookie → `findRefreshToken` checks it's still in the DB and unexpired → `verifyRefreshToken` checks the JWT itself → `findUserById` reloads the user → a **new access token only** is issued (refresh token is not rotated).

Full step-by-step tables (including logout) live in `AUTH_FLOW.md`.

## Event/message contracts

None — this repo has no message queue or pub/sub broker (no Kafka/RabbitMQ/Redis pub-sub deps in `package.json`). All communication is synchronous HTTP request/response.

## Where things live

- Route definitions → `src/routes/authRouters.js`
- Request handling / response shaping → `src/controller/authController.js`
- DB queries (users + refresh tokens) → `src/models/authModels.js`
- DB connection pool → `src/config/configDB.js`
- Table creation on startup → `src/data/createTable.js`, SQL in `src/data/userTable.sql` and `src/data/refreshTokenTable.sql`
- JWT signing/verification → `src/utility/tokens.js`
- Bearer-token auth middleware (not yet wired to any route) → `src/middlewear/authenticate.js`
- Server bootstrap, DB health check, global error handler → `server.js`

## Local dev / run instructions

Requires a running PostgreSQL instance and a `.env` file with: `DB_USER`, `DB_HOST`, `DB_DATABASE`, `DB_PORT`, `PORT`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` (optionally `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY` — default to `15m`/`7d`). Then:

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

`server.js` creates the `users` and `refresh_tokens` tables on boot if they don't already exist — no separate migration step needed.

## Known issues

- None currently tracked. Passwords are hashed with `bcrypt` (`SALT_ROUNDS = 10`) in `createUserService`/`loginUserService` (`src/models/authModels.js`).