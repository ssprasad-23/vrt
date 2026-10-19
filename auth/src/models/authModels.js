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
        "SELECT * FROM users WHERE username = $1", [username]
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

export async function findUserById(userId) {
  const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  const user = result.rows[0];
  if (!user) {
    return undefined;
  }
  const { password: _password, ...safeUser } = user;
  return safeUser;
}