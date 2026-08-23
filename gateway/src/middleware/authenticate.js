import { verifyAccessToken } from '../utility/tokens.js';

// Verifies the caller's JWT once, here, instead of in every downstream service.
// src/utility/proxyHeaders.js forwards the decoded identity onward as trusted headers.
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}
