// Opaque pagination cursor: the (created_at, video_id) of the last video on a page,
// base64url-encoded. created_at is kept as Postgres's own text form (microsecond
// precision) — a JS Date would round it to milliseconds and skip/repeat rows.
export const encodeCursor = (createdAt, videoId) =>
  Buffer.from(JSON.stringify([createdAt, videoId])).toString('base64url')

// Returns { createdAt, videoId }, or null if the cursor is malformed.
export const decodeCursor = (cursor) => {
  try {
    const [createdAt, videoId] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof createdAt !== 'string' || typeof videoId !== 'string') return null
    if (Number.isNaN(Date.parse(createdAt))) return null
    return { createdAt, videoId }
  } catch {
    return null
  }
}
