import { createClient } from 'redis';
import dotenv from 'dotenv';
import { log, logError } from '../utility/logger.js';

dotenv.config();

// Cache for the feed's first page (see redis/README.md). Optional: if Redis is down the
// feed falls back to Postgres, so nothing here is allowed to crash the service.
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // fail commands immediately while disconnected instead of queueing them until Redis is back
  disableOfflineQueue: true,
});

// without an error listener, a dropped connection would throw and kill the process;
// only log the first error of an outage, not every reconnect attempt
let lastErrorLogged = false;
redis.on('error', (err) => {
  // a refused connection is an AggregateError (IPv6 + IPv4 both failed) with an empty
  // message — the useful part ("ECONNREFUSED") is in err.code
  if (!lastErrorLogged) logError('Redis error (feed will serve from Postgres):', err.message || err.code || String(err));
  lastErrorLogged = true;
});
redis.on('ready', () => {
  lastErrorLogged = false;
  log('Redis connected');
});

// Not awaited at startup: the client keeps retrying in the background, and the feed
// works without it until it connects.
export const connectRedis = () => {
  redis.connect().catch((err) => logError('Redis connect failed:', err.message || err.code || String(err)));
};

export default redis;
