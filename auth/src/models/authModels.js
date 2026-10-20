import bcrypt from 'bcrypt'
import pool from '../config/configDB.js'

const SALT_ROUNDS = 10

export const createUserService = async (username, email, password, dob, phone_number, country) => {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const result = await pool.query(
      `INSERT INTO users (username, email, password, dob, phone_number, country)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [username, email, passwordHash, dob, phone_number, country])
    const { password: _password, ...user } = result.rows[0]
    return user
}

export const loginUserService = async (username, password) => {
    const result = await pool.query(
        // usernames are unique case-insensitively (users_username_lower_key), so log in the same way
        "SELECT * FROM users WHERE lower(username) = lower($1)", [username.trim()]
    )
    const user = result.rows[0]
    if (!user) {
        return undefined
    }
    const passwordMatches = await bcrypt.compare(password, user.password)
    if (!passwordMatches) {
        return undefined
    }
    const { password: _password, ...safeUser } = user
    return safeUser
}

// Refresh token model. Only SHA-256 hashes are stored (see hashRefreshToken in
// src/utility/tokens.js); a family is the chain of rotated tokens from one login.
export async function storeRefreshToken(userId, tokenHash, familyId, expiresAt, client = pool) {
  await client.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, tokenHash, familyId, expiresAt]
  );
}

// Swaps a presented token for the next one in its family, in one transaction: marks the old
// token used (only if it's unused and unexpired — `used_at IS NULL` means two requests can't
// both rotate the same token) and stores the new hash. Returns the old row, or undefined if the
// token is unknown, expired or already used (nothing is changed then).
export async function rotateRefreshToken(oldTokenHash, newTokenHash, expiresAt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE refresh_tokens
       SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING *`,
      [oldTokenHash]
    );
    const old = result.rows[0];
    if (!old) {
      await client.query('ROLLBACK');
      return undefined;
    }
    await storeRefreshToken(old.user_id, newTokenHash, old.family_id, expiresAt, client);
    await client.query('COMMIT');
    return old;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function findRefreshToken(tokenHash) {
  const result = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  return result.rows[0];
}

// Revokes one login session: every token (used or not) in its rotation chain.
export async function deleteRefreshTokenFamily(familyId) {
  await pool.query('DELETE FROM refresh_tokens WHERE family_id = $1', [familyId]);
}

export async function deleteAllRefreshTokensForUser(userId) {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// Used tokens are kept until they expire so a replay can still be recognised as reuse;
// after that they're just dead rows.
export async function deleteExpiredRefreshTokens() {
  await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= now()');
}

export async function findUserByEmail(email) {
  // emails are stored lowercased and unique case-insensitively (users_email_lower_key)
  const result = await pool.query('SELECT user_id, email FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  return result.rows[0];
}

// Password reset codes (password_reset_codes table, see src/data/passwordResetCodeTable.sql).
export const MAX_RESET_CODE_ATTEMPTS = 5;

// For the per-user send limits: when the last code went out, and how many in the past hour
export async function getResetCodeStats(userId) {
  const result = await pool.query(
    `SELECT max(created_at) AS last_sent_at,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS sent_last_hour
     FROM password_reset_codes WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

// Only the newest code works: any earlier unused ones are killed in the same transaction.
export async function createResetCode(userId, codeHash, expiresAt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE password_reset_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    await client.query(
      'INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, codeHash, expiresAt]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Uses up one guess on the user's live code (unused, not yet verified, unexpired, guesses left)
// and returns the row, or undefined if there's no such code. Counting the guess *before*
// checking it means parallel requests can't sneak in more than MAX_RESET_CODE_ATTEMPTS guesses.
export async function claimResetCodeAttempt(userId) {
  const result = await pool.query(
    `UPDATE password_reset_codes SET attempts = attempts + 1
     WHERE user_id = $1 AND used_at IS NULL AND reset_token_hash IS NULL
       AND expires_at > now() AND attempts < $2
     RETURNING *`,
    [userId, MAX_RESET_CODE_ATTEMPTS]
  );
  return result.rows[0];
}

// Correct code: it can't be entered again; the reset token is what's good from here on.
// Returns false if another request verified the same code first.
export async function markResetCodeVerified(id, resetTokenHash, resetTokenExpiresAt) {
  const result = await pool.query(
    `UPDATE password_reset_codes SET reset_token_hash = $2, reset_token_expires_at = $3
     WHERE id = $1 AND reset_token_hash IS NULL AND used_at IS NULL`,
    [id, resetTokenHash, resetTokenExpiresAt]
  );
  return result.rowCount === 1;
}

// Sets the new password if the reset token is valid, spends the token, and logs the user out
// of every device, all in one transaction. Returns false (nothing changed) for a bad token.
export async function resetPasswordWithToken(resetTokenHash, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE password_reset_codes SET used_at = now()
       WHERE reset_token_hash = $1 AND used_at IS NULL AND reset_token_expires_at > now()
       RETURNING user_id`,
      [resetTokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('UPDATE users SET password = $1 WHERE user_id = $2', [passwordHash, row.user_id]);
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Housekeeping: codes are dead after 10 minutes, but a day's worth is kept for the send limits.
export async function deleteOldResetCodes() {
  await pool.query("DELETE FROM password_reset_codes WHERE created_at < now() - interval '1 day'");
}

export async function findUserById(userId) {
  const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  const user = result.rows[0];
  if (!user) {
    return undefined;
  }
  const { password: _password, ...safeUser } = user;
  return safeUser;
}