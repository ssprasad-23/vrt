import jwt from 'jsonwebtoken';

// The gateway is the only place access tokens get verified now —
// ACCESS_TOKEN_SECRET must match the auth service's value.
export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}
