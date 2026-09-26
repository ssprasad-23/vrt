// Upstream service targets the gateway proxies to.
export const SERVICE_TARGETS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
  upload: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3001',
};
