import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { log } from './logger.js';

// Access tokens carry only the user id (as the standard `sub` claim). The gateway checks
// iss/aud, so these must match ACCESS_TOKEN_ISSUER/AUDIENCE in gateway/src/utility/tokens.js.
const ACCESS_TOKEN_ALGORITHM = 'HS256';
const ACCESS_TOKEN_ISSUER = 'vrt-auth';
const ACCESS_TOKEN_AUDIENCE = 'vrt-api';

// Refresh tokens live this long from when they're issued. Every refresh rotates the token and
// restarts the clock (sliding expiry), so only users idle for this long have to log in again.
// The single source for the cookie's maxAge and refresh_tokens.expires_at.
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;
export const REFRESH_TOKEN_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export function generateAccessToken(user) {
  const token = jwt.sign(
    { sub: String(user.user_id) },
    process.env.ACCESS_TOKEN_SECRET,
    {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    }
  );
  log('Access token created');
  return token;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
    algorithms: [ACCESS_TOKEN_ALGORITHM],
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  });
}

// Refresh tokens are opaque random strings, not JWTs — the refresh_tokens row is what makes
// one valid, so a signature would add nothing. Only hashRefreshToken(token) is stored.
export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// SHA-256 is enough here (no salt/bcrypt needed): the token is 256 random bits, not a
// guessable password, so a leaked hash can't be reversed into a usable token.
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiresAt() {
  return new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
}
