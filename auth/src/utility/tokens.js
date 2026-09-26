import jwt from 'jsonwebtoken';
import { log } from './logger.js';

export function generateAccessToken(user) {
  const token = jwt.sign(
    { userId: user.user_id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
  log('Access token created');
  return token;
}

export function generateRefreshToken(user) {
  const token = jwt.sign(
    { userId: user.user_id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
  log('Refresh token created');
  return token;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
}