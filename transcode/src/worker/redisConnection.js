// BullMQ connection options. Passed as a plain config object (not an ioredis instance) —
// BullMQ creates its own ioredis client from this under the hood.
export const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};
