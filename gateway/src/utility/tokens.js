import jwt from 'jsonwebtoken';

// The gateway is the only place access tokens get verified now —
// ACCESS_TOKEN_SECRET must match the auth service's value, and these must match
// the algorithm/issuer/audience auth signs with (auth/src/utility/tokens.js).
const ACCESS_TOKEN_ALGORITHM = 'HS256';
const ACCESS_TOKEN_ISSUER = 'vrt-auth';
const ACCESS_TOKEN_AUDIENCE = 'vrt-api';

// Returns the decoded payload; the user id is in `sub` (a string).
export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
    algorithms: [ACCESS_TOKEN_ALGORITHM],
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  });
}
