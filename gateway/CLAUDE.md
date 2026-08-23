# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

No test runner is configured (`npm test` is a placeholder that exits with an error).

## Architecture

Express 5 reverse proxy using ES modules (`"type": "module"`). This is the single public entry point for the whole app — `auth`, `upload`, and `transcode` are no longer meant to be called directly by clients. It does no business logic of its own: it verifies the caller's JWT once, then forwards the request to the right downstream service.

**Request flow**: `server.js` → `src/routes/gatewayRoutes.js`, which mounts three proxies:
- `/auth/*` → `auth` service, unauthenticated (see below), via `http-proxy-middleware`.
- `/videos/*` → `upload` service, behind `src/middleware/authenticate.js`.
- `/transcode/*` → `transcode` service, behind `src/middleware/authenticate.js`.

**No body parsing** (`server.js`): deliberately no `express.json()`. This is a pure passthrough proxy — the request body is streamed straight to the upstream service untouched. Parsing it here would consume the stream and break proxying of POST/PUT bodies (there's no need to read the body at the gateway; identity comes from the `Authorization` header).

**Auth model — this is the important part**: the gateway is now the *only* place a JWT gets verified. `src/middleware/authenticate.js` verifies the `Authorization: Bearer <token>` header (`src/utility/tokens.js`, same `ACCESS_TOKEN_SECRET` as the `auth` service) and sets `req.user = { userId, email }`. `src/utility/proxyHeaders.js`'s `attachProxyHeaders` (wired as the proxy's `on.proxyReq` hook) then forwards that identity downstream as `x-user-id`/`x-user-email` headers, plus an `x-gateway-secret` header (`GATEWAY_SECRET` env, must match `upload`'s and `transcode`'s `.env`). `upload` and `transcode` no longer verify JWTs themselves — their `authenticate.js` middleware just checks `x-gateway-secret` matches and trusts `x-user-id`/`x-user-email` as-is. `proxyReq.setHeader` always overwrites rather than appends, so a client can't spoof these by sending its own `x-user-id`/`x-gateway-secret` headers — verified directly with a smoke test (fake upstreams + real token/no-token/bad-token/spoofed-header requests) when this was built.

**auth's routes stay unauthenticated at the gateway**: `POST /userSignUp`, `POST /userLogin`, `POST /refreshToken`, `POST /logout` don't take an access token (you don't have one yet for signup/login; refresh/logout use the httpOnly refresh-token cookie instead), so `/auth/*` isn't behind `authenticate`.

**Path handling — a real gotcha, worth understanding before touching this file**: Express's `router.use(mountPath, middleware)` strips `mountPath` off `req.url` *before* the proxy middleware ever sees it. For `/auth/*`, that's exactly what we want — `auth`'s own router isn't prefixed with `/auth` (its routes are just `/userSignUp` etc. mounted at `/`), so the stripped path already matches. For `/videos/*` and `/transcode/*`, it's the opposite problem: `upload`'s and `transcode`'s own routers *do* expect the full prefixed path (`/videos/upload-init`, `/transcode`), so each of those two proxies has an explicit `pathRewrite: (path) => \`/videos${path}\`` (or `/transcode`) to add the stripped prefix back. Getting this wrong silently 404s against the real service while a naive fake-upstream test (one that responds 200 regardless of path) won't catch it — that's exactly what happened during initial testing here.

**Service targets** (`src/config/services.js`): `AUTH_SERVICE_URL`, `UPLOAD_SERVICE_URL`, `TRANSCODE_SERVICE_URL` env vars, defaulting to `localhost:3000`/`3001`/`3002`.

## Where things live

- Route/proxy definitions → `src/routes/gatewayRoutes.js`
- JWT verification middleware → `src/middleware/authenticate.js`, `src/utility/tokens.js`
- Header injection for downstream trust (`x-user-id`, `x-user-email`, `x-gateway-secret`) → `src/utility/proxyHeaders.js`
- Upstream service URLs → `src/config/services.js`
- Server bootstrap, global error handler → `server.js`

## Local dev / run instructions

Requires `auth`, `upload`, and `transcode` all reachable at their configured URLs, and a `.env` file with `PORT` (default `8080`), `ACCESS_TOKEN_SECRET` (must match `auth`'s value), `GATEWAY_SECRET` (must match `upload`'s and `transcode`'s value — pick any strong random string, just keep it in sync across all three), and `AUTH_SERVICE_URL`/`UPLOAD_SERVICE_URL`/`TRANSCODE_SERVICE_URL`.

```bash
npm start        # run server
npm run dev      # run server with auto-reload (node --watch)
```

## Known issues / not yet implemented

- `upload` and `transcode` are only as safe as `GATEWAY_SECRET` staying secret and them not being reachable by anything except the gateway (e.g. bound to localhost / an internal Docker network, ports not exposed publicly) — the gateway doesn't enforce that at the network level, it's an operational assumption.
- No rate limiting, request logging, or retries on upstream failure — a downstream service being down surfaces as whatever error `http-proxy-middleware` produces, unhandled beyond the generic 500 handler.
- `auth`'s own routes have no gateway-level protection at all (by design, since they're pre-authentication) — nothing stops someone from hitting `auth` directly if its port is reachable.
