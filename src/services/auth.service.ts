import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import type { User } from "../db/types.js";

const SALT_ROUNDS = 12;

/**
 * Create a new user with a bcrypt-hashed password.
 * Returns the inserted user row.
 */
export async function createUser(email: string, password: string): Promise<User> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await pool.query<User>(
    `
    INSERT INTO users (email, password_hash)
    VALUES ($1, $2)
    RETURNING *
    `,
    [email.toLowerCase(), passwordHash]
  );

  const user = result.rows[0];
  if (!user) throw new Error("Failed to create user");
  return user;
}

/**
 * Look up a user by email. Returns null if not found.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

/**
 * Verify a plaintext password against the stored bcrypt hash.
 */
export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

/**
 * Hash helper for refresh tokens.
 * We store only the SHA-256 hash in the DB so a DB leak doesn't expose raw refresh tokens.
 */
export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Persist a refresh session for a user.
 * Stores token hash (not raw token) + expiry timestamp.
 */
export async function storeRefreshToken(userId: number, rawRefreshToken: string, expiresAt: Date) {
  const tokenHash = sha256(rawRefreshToken);

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt.toISOString()]
  );
}

/**
 * Validate a refresh token by checking DB state:
 * - token exists (hash matches)
 * - not revoked
 * - not expired
 *
 * (Optional helper; rotation uses rotateRefreshToken instead.)
 */
export async function isRefreshTokenValid(
  rawRefreshToken: string
): Promise<{ userId: number } | null> {
  const tokenHash = sha256(rawRefreshToken);

  const result = await pool.query<{ user_id: number }>(
    `
    SELECT user_id
    FROM refresh_tokens
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > now()
    `,
    [tokenHash]
  );

  const row = result.rows[0];
  return row ? { userId: Number(row.user_id) } : null;
}

/**
 * Revoke a refresh token so it can no longer be used to mint new access tokens.
 * Used during logout.
 */
export async function revokeRefreshToken(rawRefreshToken: string) {
  const tokenHash = sha256(rawRefreshToken);

  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked_at = now()
    WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [tokenHash]
  );
}

/**
 * Refresh token rotation (one-time use refresh tokens).
 * Atomically:
 *  1) validates the current token
 *  2) revokes it
 *  3) creates a brand new refresh token session
 *
 * Returns userId + the new raw refresh token (to set as cookie).
 */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  newExpiresAt: Date
): Promise<{ userId: number; newRefreshToken: string }> {
  const oldHash = sha256(rawRefreshToken);

  // Generate the next refresh token
  const newRefreshToken = crypto.randomBytes(32).toString("base64url");
  const newHash = sha256(newRefreshToken);

  await pool.query("BEGIN"); 
  try {
    // 1) Lock the session row so two refresh calls can't both succeed
    const sessionRes = await pool.query<{ user_id: number }>(
      `
      SELECT user_id
      FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()
      FOR UPDATE
      `,
      [oldHash]
    );

    const row = sessionRes.rows[0];
    if (!row) {
      await pool.query("ROLLBACK");
      throw new Error("REFRESH_INVALID");
    }

    const userId = Number(row.user_id);

    // 2) Revoke old token (one-time use)
    await pool.query(
      `
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL
      `,
      [oldHash]
    );

    // 3) Insert new token session
    await pool.query(
      `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      `,
      [userId, newHash, newExpiresAt.toISOString()]
    );

    await pool.query("COMMIT");
    return { userId, newRefreshToken };
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

// ----- Email verification helpers -----

/**
 * Create a new email verification token for the user.
 * Stores only the token hash in the DB. Returns the raw token to embed in a link.
 */
export async function createEmailVerificationToken( userId: number, expiresAt: Date): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url"); //Random string
  const tokenHash = sha256(rawToken); //Hashes string

  //Insert
  await pool.query(
    `
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return rawToken;
}

/**
 * Verify a token and mark it used (one-time).
 * Returns userId if valid, otherwise null.
 */
export async function consumeEmailVerificationToken(rawToken: string): Promise<number | null> {
  const tokenHash = sha256(rawToken); //hash it

  await pool.query("BEGIN");
  try {
    // Lock row so token can't be used twice concurrently
    const r = await pool.query<{ user_id: number }>(
      `
      SELECT user_id
      FROM email_verification_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      FOR UPDATE
      `,
      [tokenHash]
    );

    const row = r.rows[0];
    if (!row) {
      await pool.query("ROLLBACK");
      return null;
    }

    // Mark token as used
    await pool.query(
      `
      UPDATE email_verification_tokens
      SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL
      `,
      [tokenHash]
    );

    await pool.query("COMMIT");
    return Number(row.user_id);
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

/**
 * Mark a user's email as verified.
 */
export async function markUserEmailVerified(userId: number): Promise<void> {
  await pool.query(
    `
    UPDATE users
    SET email_verified = true,
        updated_at = now()
    WHERE id = $1
    `,
    [userId]
  );
}
