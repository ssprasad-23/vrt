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

//JWT Token model
export async function storeRefreshToken(userId, token, expiresAt) {
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
}

export async function findRefreshToken(token) {
  const result = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token = $1',
    [token]
  );
  return result.rows[0];
}

export async function deleteRefreshToken(token) {
  await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

export async function deleteAllRefreshTokensForUser(userId) {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
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