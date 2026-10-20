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
  await ensureUniqueUsers();

  const refreshTableExists = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'refresh_tokens'
    );
  `);

  if (!refreshTableExists.rows[0].exists) {
    await createRefreshTokensTable();
    log("Refresh tokens table created");
  } else if (!(await refreshTableHasHashes())) {
    // Tables from before hashed, rotating refresh tokens stored the raw JWT in a `token`
    // column. Those tokens can't be converted (and are no longer accepted anyway), so the
    // table is recreated — everyone logs in again once.
    await db.query("DROP TABLE refresh_tokens");
    await createRefreshTokensTable();
    log("Refresh tokens table recreated for hashed, rotating tokens (existing sessions logged out)");
  } else {
    log("Refresh tokens table already exists");
  }

  const resetTableExists = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'password_reset_codes'
    );
  `);

  if (!resetTableExists.rows[0].exists) {
    const sqlFile = path.join(__dirname, "../data/passwordResetCodeTable.sql");
    await db.query(fs.readFileSync(sqlFile, "utf8"));
    log("Password reset codes table created");
  } else {
    log("Password reset codes table already exists");
  }
}

async function createRefreshTokensTable() {
  const sqlFile = path.join(__dirname, "../data/refreshTokenTable.sql");
  const createTableSQL = fs.readFileSync(sqlFile, "utf8");
  await db.query(createTableSQL);
}

async function refreshTableHasHashes() {
  const result = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'refresh_tokens' AND column_name = 'token_hash'
    );
  `);
  return result.rows[0].exists;
}

// One account per username and per email, ignoring case ("Bob" and "bob" clash). Safe to run on
// every boot. Fails startup if existing rows already clash — those need resolving by hand first.
// The index names are what authController.js maps to a 409 message.
async function ensureUniqueUsers() {
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username))");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))");
}
