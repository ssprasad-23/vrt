CREATE TABLE IF NOT EXISTS videos (
    video_id VARCHAR(12) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    -- each file's size sits next to its key, in MB (1024 * 1024 bytes, 1 decimal, e.g. 16.2)
    -- uploaded file's key in the private original bucket; size set on /complete
    original_s3_key VARCHAR(1024) NOT NULL UNIQUE,
    original_size_mb NUMERIC(10, 1),
    -- encoded files' keys in the public media bucket, each key + size set when the transcode service
    -- reports that output done. H.264 plays on every device (what the feed serves); AV1 is smaller
    -- but needs a hardware AV1 decoder (iPhone 15 Pro+).
    h264_s3_key VARCHAR(1024),
    h264_size_mb NUMERIC(10, 1),
    av1_s3_key VARCHAR(1024),
    av1_size_mb NUMERIC(10, 1),
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_video_modtime
BEFORE UPDATE ON videos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
