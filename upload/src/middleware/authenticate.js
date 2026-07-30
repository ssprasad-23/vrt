import { verifyAccessToken } from '../utility/tokens.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // "Bearer <token>"

  if (token) {
    console.log("Token received for authenticate in upload")
    console.log(token)
  }
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    req.user = verifyAccessToken(token);
    console.log("Token verified successfully in upload")
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}
