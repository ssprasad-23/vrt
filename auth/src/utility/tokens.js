import jwt from 'jsonwebtoken';

export function generateAccessToken(user) {
  const token = jwt.sign(
    { userId: user.user_id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
  console.log('access token created', new Date().toLocaleTimeString());
  return token;
}

export function generateRefreshToken(user) {
  const token = jwt.sign(
    { userId: user.user_id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
  console.log('refresh token created', new Date().toLocaleTimeString());
  return token;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
}