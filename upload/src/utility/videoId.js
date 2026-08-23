import { randomBytes } from 'crypto';

// 9 random bytes -> 12 base64url characters (no padding)
export const generateVideoId = () => randomBytes(9).toString('base64url')