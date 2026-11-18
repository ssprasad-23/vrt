-- One row per report: reporter_id flagged video_id for reason. One report per person per video,
-- so a future "hide after N reports" count can't be inflated by a single user. Reports are only
-- recorded for now; nothing acts on them yet. reporter_id comes from the auth service's users
-- table (a different service), so it has no foreign key; video_id does, and a video's reports
-- are deleted with it.
CREATE TABLE IF NOT EXISTS video_reports (
    video_id VARCHAR(12) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL,
    reason VARCHAR(30) NOT NULL CHECK (reason IN ('sexual', 'child_safety', 'hate_harassment_violence')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (video_id, reporter_id)
);
