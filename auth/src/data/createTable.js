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
      AND table_name = 'users'
    );
  `);

  if (!tableExists.rows[0].exists) {
    const sqlFile = path.join(__dirname, "../data/userTable.sql");
    const createTableSQL = fs.readFileSync(sqlFile, "utf8");
    await db.query(createTableSQL);
    log("Users table created");
  } else {
    log("Users table already exists");
  }

  const refreshTableExists = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'refresh_tokens'
    );
  `);

  if (!refreshTableExists.rows[0].exists) {
    const sqlFile = path.join(__dirname, "../data/refreshTokenTable.sql");
    const createTableSQL = fs.readFileSync(sqlFile, "utf8");
    await db.query(createTableSQL);
    log("Refresh tokens table created");
  } else {
    log("Refresh tokens table already exists");
  }
}
