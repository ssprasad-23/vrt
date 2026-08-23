// Attached to every proxied request via http-proxy-middleware's onProxyReq hook.
// proxyReq.setHeader always overwrites rather than appends, so this can't be
// spoofed by a client sending its own x-user-id/x-gateway-secret headers.
export function attachProxyHeaders(proxyReq, req) {
  proxyReq.setHeader('x-gateway-secret', process.env.GATEWAY_SECRET);

  if (req.user) {
    proxyReq.setHeader('x-user-id', String(req.user.userId));
    if (req.user.email) proxyReq.setHeader('x-user-email', req.user.email);
  }
}
