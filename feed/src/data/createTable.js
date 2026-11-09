import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/configDB.js";
import { log } from "../utility/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Creates the user_blocks table this service owns. The SQL is all IF NOT EXISTS, so it's
// safe to run on every boot. (The videos table is owned and created by the upload service.)
export default async function initDb() {
  const sqlFile = path.join(__dirname, "userBlocksTable.sql");
  await db.query(fs.readFileSync(sqlFile, "utf8"));
  log("User blocks table ready");
}
