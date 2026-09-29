CREATE TABLE IF NOT EXISTS transcode_jobs (
    video_id VARCHAR(12) PRIMARY KEY,
    source_key TEXT NOT NULL,
    -- legacy single-output key (AV1-only jobs from before H.264 was added); new jobs use outputs
    output_key VARCHAR(1024),
    -- finished encodes, by output name: { "h264": "<key>", "av1": "<key>" }
    outputs JSONB NOT NULL DEFAULT '{}',
    settings JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transcode_job_modtime
BEFORE UPDATE ON transcode_jobs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
