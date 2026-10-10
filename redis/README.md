# Redis: feed cache

Redis caches the **first page of the video feed**. It's used by the [`feed`](../feed) service only.

## Why the first feed page

Opening the app sends `GET /feed?limit=3` with no cursor. The feed isn't personalised, so every user gets the same newest videos back from the same Postgres query. That one request is the most repeated read in the system, and its answer only changes when a new video finishes encoding. Serving it from Redis keeps that load off Postgres.

Later pages (requests with a `cursor`) are not cached. People stop scrolling at different points, so those requests rarely repeat.

## How it works

```
                                  ┌──────────┐
 app ──► gateway :8080 ──► feed ──┤  Redis   │  1. GET feed:first
                           :3003  └──────────┘     found     → HIT, respond
                             │
                             │    ┌──────────┐  2. not found → query Postgres,
                             └────┤ Postgres │     SET feed:first EX 30 → MISS
                                  └──────────┘
```

The pattern is **cache-aside**: `feed` checks Redis first. On a miss it reads Postgres and writes the result back with a **30-second TTL**. Nothing else writes to the cache. The trade-off is that a newly finished video can take up to 30 seconds to reach the top of the feed.

Every first-page response carries an `X-Cache` header:

| `X-Cache` | Meaning |
|---|---|
| `HIT` | Served from Redis; Postgres not touched |
| `MISS` | Not cached: served from Postgres, then saved to Redis for 30s |
| `BYPASS` | Redis unavailable: served from Postgres, nothing saved |

### Fail-open

Redis is optional. If it's down when `feed` starts, the service starts anyway and the client keeps reconnecting in the background. If it drops mid-request, that request falls through to Postgres. Users never see an error because of Redis; the worst case is losing the speed-up.

## Keys

| Key | Value | TTL | Written by | Read by |
|---|---|---|---|---|
| `feed:first` | JSON `{ videos, nextCursor }`, the exact `data` of `GET /feed?limit=3` | 30s | `feed` | `feed` |

## Configuration

[`redis.conf`](redis.conf) sets Redis up as a cache: a 64 MB memory limit, least-recently-used eviction when full, and no persistence. Everything in it can be rebuilt from Postgres.

`feed` connects with `REDIS_URL` (default `redis://localhost:6379`).

## Run it

From the repo root:

```bash
docker run -d --name redis -p 6379:6379 \
  -v "$(pwd)/redis/redis.conf:/usr/local/etc/redis/redis.conf" \
  redis:8-alpine redis-server /usr/local/etc/redis/redis.conf
```

## Inspect it

```bash
docker exec -it redis redis-cli
> GET feed:first       # the cached page
> TTL feed:first       # seconds until it expires
> MONITOR              # watch every command live (Ctrl+C to stop)
```

Or watch the header through the gateway:

```bash
curl -si "http://localhost:8080/feed?limit=3" -H "Authorization: Bearer <token>" | grep -i x-cache
```

### Console output

`feed` logs every cache decision for the first page (scrolling requests with a cursor log nothing):

```
2:40am feed: Redis MISS: feed:first not cached, requesting first page from Postgres
2:40am feed: Redis SET: cached first feed page from Postgres in feed:first (3 videos, expires in 30s)
2:40am feed: Redis HIT: first feed page served from cache (3 videos, key feed:first)
2:45am feed: Redis BYPASS: Redis unavailable, serving first feed page from Postgres (not cached)
2:50am feed: Redis SET skipped: feed is empty, nothing to cache in feed:first
```

On a miss the response is sent before the `SET`, so the user never waits for the cache write. An empty feed is never cached, so the first uploaded video appears on the next request instead of up to 30s later.

## Why there's no separate cache service

`feed` talks to Redis directly, using Redis's own protocol over a connection it keeps open. A lookup takes well under a millisecond.

A "cache microservice" (an HTTP server in front of Redis that `feed` calls) would add a second network hop and HTTP overhead to every lookup. That overhead costs about as much as the Postgres query the cache is meant to skip. It would also be one more service to run and one more thing that can go down. This folder holds only Redis's setup and documentation; the code lives where it's used.

## Code

- Client and connection: [`feed/src/config/redisConfig.js`](../feed/src/config/redisConfig.js)
- Cache read/write and `X-Cache`: [`feed/src/controller/feedController.js`](../feed/src/controller/feedController.js)
- Startup (non-blocking connect): [`feed/server.js`](../feed/server.js)

## Possible next steps

- **Clear the cache on new videos:** `upload`'s transcode-completed worker could `DEL feed:first` when a video's H.264 encode lands, so new videos appear immediately instead of within 30 seconds.
- **Login rate limiting:** count login attempts per IP at the gateway (`INCR` + `EXPIRE`) to slow down password guessing.
