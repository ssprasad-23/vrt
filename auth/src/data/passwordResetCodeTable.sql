-- One row per password reset code emailed out. The 6-digit code only exists in the email;
-- this table stores an HMAC of it (see hashResetCode in src/utility/tokens.js).
-- Lifecycle: created -> verified (reset_token_hash set, the app gets a one-time reset token)
-- -> used (password changed). A code is also killed (used_at set) after MAX attempts wrong
-- guesses, or when a newer code is requested for the same user.
CREATE TABLE password_reset_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  reset_token_hash CHAR(64) UNIQUE,
  reset_token_expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_codes_user_id_idx ON password_reset_codes (user_id);
