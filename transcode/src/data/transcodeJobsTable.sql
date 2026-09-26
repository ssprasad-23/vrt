CREATE TABLE IF NOT EXISTS transcode_jobs (
    video_id VARCHAR(12) PRIMARY KEY,
    source_url TEXT NOT NULL,
    output_key VARCHAR(1024),
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
