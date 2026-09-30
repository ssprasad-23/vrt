import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/configDB.js";
import { log } from "../utility/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function initDb() {
  const tableExists = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'videos'
    );
  `);

  if (!tableExists.rows[0].exists) {
    const sqlFile = path.join(__dirname, "../data/videosTable.sql");
    const createTableSQL = fs.readFileSync(sqlFile, "utf8");
    await db.query(createTableSQL);
    log("Videos table created");
  } else {
    log("Videos table already exists");
    await migrateEncodedKeys();
  }
}

// Tables created before H.264 was added have a single transcoded_s3_key column (always AV1).
// Renames it to av1_s3_key and adds h264_s3_key. Safe to run on every boot.
async function migrateEncodedKeys() {
  const oldColumn = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'transcoded_s3_key'
    );
  `);
  if (oldColumn.rows[0].exists) {
    await db.query(`ALTER TABLE videos RENAME COLUMN transcoded_s3_key TO av1_s3_key`);
    log("Renamed videos.transcoded_s3_key to av1_s3_key");
  }
  await db.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS h264_s3_key VARCHAR(1024)`);

  // size columns (MB) added later
  await db.query(`
    ALTER TABLE videos
      ADD COLUMN IF NOT EXISTS original_size_mb NUMERIC(10, 1),
      ADD COLUMN IF NOT EXISTS h264_size_mb NUMERIC(10, 1),
      ADD COLUMN IF NOT EXISTS av1_size_mb NUMERIC(10, 1)
  `);
}
