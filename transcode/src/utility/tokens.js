import jwt from 'jsonwebtoken';

// This service only verifies access tokens issued by the auth service —
// ACCESS_TOKEN_SECRET must match the auth service's value.
export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}
