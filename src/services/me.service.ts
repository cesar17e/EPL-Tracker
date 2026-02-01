import { pool } from "../db/pool.js";

/**
 * Return current settings for UI.
 * Will return if the user is email verified, is it email opt in, and the time zone of user
 */
export async function getMySettings(userId: number) {
  const { rows } = await pool.query<{
    email_verified: boolean;
    email_opt_in: boolean;
    time_zone: string;
  }>(
    `
    SELECT email_verified, email_opt_in, time_zone
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  const user = rows[0];
  if (!user) {
    const err: any = new Error("User not found");
    err.status = 404;
    throw err;
  }

  return {
    emailVerified: user.email_verified,
    emailOptIn: user.email_opt_in,
    timeZone: user.time_zone,
  };
}

/**
 * Update email opt-in.
 * Can only enable opt-in if email is verified.
 */
export async function updateEmailOptIn(userId: number, emailOptIn: boolean) {
  // First read current verified status
  const { rows } = await pool.query<{
    email_verified: boolean;
  }>(
    `
    SELECT email_verified
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  const u = rows[0];
  if (!u) {
    const err: any = new Error("User not found");
    err.status = 404;
    throw err;
  }

  if (emailOptIn === true && !u.email_verified) {
    const err: any = new Error("Email must be verified to enable reminders");
    err.status = 403;
    throw err;
  }

  const updated = await pool.query<{
    email_verified: boolean;
    email_opt_in: boolean;
    time_zone: string;
  }>(
    `
    UPDATE users
    SET email_opt_in = $2, updated_at = now()
    WHERE id = $1
    RETURNING email_verified, email_opt_in, time_zone
    `,
    [userId, emailOptIn]
  );

  const user = updated.rows[0]!;
  return {
    emailVerified: user.email_verified,
    emailOptIn: user.email_opt_in,
    timeZone: user.time_zone,
  };
}

/**
 * List favorite teams for a user (joined to teams table).
 */
export async function listMyFavorites(userId: number) {
  const { rows } = await pool.query<{
    id: number;
    external_team_id: number;
    name: string;
    short_name: string | null;
    color: string | null;
    away_color: string | null;
    image_version: number | null;
    created_at: string;
  }>(
    `
    SELECT
      t.id,
      t.external_team_id,
      t.name,
      t.short_name,
      t.color,
      t.away_color,
      t.image_version,
      uft.created_at
    FROM user_favorite_teams uft
    JOIN teams t ON t.id = uft.team_id
    WHERE uft.user_id = $1
    ORDER BY uft.created_at DESC
    `,
    [userId]
  );

  return rows.map((r) => ({
    id: r.id,
    externalTeamId: r.external_team_id,
    name: r.name,
    shortName: r.short_name,
    color: r.color,
    awayColor: r.away_color,
    imageVersion: r.image_version,
    favoritedAt: r.created_at,
  }));
}

/**
 * Add a favorite team (idempotent).
 */
export async function addFavorite(userId: number, teamId: number) {
  // Ensure team exists (nice error for UI)
  const teamCheck = await pool.query<{ id: number }>(
    `SELECT id FROM teams WHERE id = $1`,
    [teamId]
  );
  if (teamCheck.rowCount === 0) {
    const err: any = new Error("Team not found");
    err.status = 404;
    throw err;
  }

  // Idempotent insert (avoid duplicate favorites)
  await pool.query(
    `
    INSERT INTO user_favorite_teams (user_id, team_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, team_id) DO NOTHING
    `,
    [userId, teamId]
  );
}

/**
 * Remove a favorite team (idempotent).
 */
export async function removeFavorite(userId: number, teamId: number) {
  await pool.query(
    `
    DELETE FROM user_favorite_teams
    WHERE user_id = $1 AND team_id = $2
    `,
    [userId, teamId]
  );
}
