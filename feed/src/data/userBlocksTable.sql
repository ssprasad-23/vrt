-- One row per block: blocker_id doesn't want to see blocked_id, and vice versa (the feed
-- filters both directions). User ids come from the auth service's users table, which lives
-- in a different database, so there's no foreign key.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

-- the primary key covers "who did I block"; this covers "who blocked me"
CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx ON user_blocks (blocked_id);
