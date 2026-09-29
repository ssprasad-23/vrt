// The API gateway verifies the caller's JWT and forwards the decoded identity as
// trusted headers — this service doesn't verify tokens itself. GATEWAY_SECRET
// must match the gateway's value, so a request that didn't come through it is rejected.
export function authenticate(req, res, next) {
  const gatewaySecret = req.headers['x-gateway-secret'];
  if (!gatewaySecret || gatewaySecret !== process.env.GATEWAY_SECRET) {
    return res.status(403).json({ message: 'Forbidden: request must come through the API gateway' });
  }

  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ message: 'No user identity provided' });

  req.user = { userId: Number(userId), email: req.headers['x-user-email'] };
  next();
}
