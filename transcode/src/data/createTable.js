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
      AND table_name = 'transcode_jobs'
    );
  `);

  if (!tableExists.rows[0].exists) {
    const sqlFile = path.join(__dirname, "../data/transcodeJobsTable.sql");
    const createTableSQL = fs.readFileSync(sqlFile, "utf8");
    await db.query(createTableSQL);
    log("Transcode jobs table created");
  } else {
    log("Transcode jobs table already exists");
    await migrateOutputs();
  }
}

// Tables created before H.264 was added have no outputs column. Adds it and carries each
// old AV1-only job's output_key over as outputs.av1, so the worker only encodes the missing
// H.264 output for them. Safe to run on every boot.
async function migrateOutputs() {
  await db.query(`ALTER TABLE transcode_jobs ADD COLUMN IF NOT EXISTS outputs JSONB NOT NULL DEFAULT '{}'`);
  const result = await db.query(`
    UPDATE transcode_jobs
    SET outputs = jsonb_build_object('av1', output_key)
    WHERE output_key IS NOT NULL AND outputs = '{}'
  `);
  if (result.rowCount > 0) {
    log(`Migrated ${result.rowCount} transcode job(s) to the outputs column`);
  }
}
