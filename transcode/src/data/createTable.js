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
  }
}
