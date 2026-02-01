import { pool } from "../db/pool.js";
import {sendFixtureDigestEmail} from "./email.service.js"

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


//!-------Email sending endpoint for upcoming fixture------

type UpcomingFixtureRow = {
    id: number;
    start_time: string;
    status_text: string | null;
    short_status_text: string | null;
  
    home_team_external_id: number;
    away_team_external_id: number;
  
    home_score: string | null;
    away_score: string | null;
  
    home_team_name: string | null;
    away_team_name: string | null;
  
    home_team_short_name: string | null;
    away_team_short_name: string | null;
  };
  
  function isEndedText(statusText: string | null, shortStatusText: string | null) {
    const s = (statusText ?? shortStatusText ?? "").toLowerCase();
    return s === "ended";
  }
  
  /**
   * Send fixture digest for a single user (used by /api/me/email-fixtures).
   *
   * Rules:
   * - user must exist
   * - user must be email_verified (enforced by middleware, but we keep it safe)
   * - user must have email_opt_in = true
   * - user must have at least 1 favorite team
   *
   * Behavior:
   * - For each favorite team, pick the next upcoming fixture (soonest start_time)
   * - Send one email to the user containing all fixtures
   */
  export async function sendFixtureDigestForUser(userId: number) {
    // 1) Load user contact + settings
    const userRes = await pool.query<{
      email: string;
      email_verified: boolean;
      email_opt_in: boolean;
      time_zone: string;
    }>(
      `
      SELECT email, email_verified, email_opt_in, time_zone
      FROM users
      WHERE id = $1
      `,
      [userId]
    );
  
    const user = userRes.rows[0];
    if (!user) {
      const err: any = new Error("User not found");
      err.status = 404;
      throw err;
    }
  
    if (!user.email_verified) {
      const err: any = new Error("Email not verified");
      err.status = 403;
      throw err;
    }
  
    if (!user.email_opt_in) {
      const err: any = new Error("Email reminders are disabled (opt-in required)");
      err.status = 403;
      throw err;
    }
  
    // 2) Load favorites (team ids + names)
    const favRes = await pool.query<{
      team_id: number;
      team_name: string;
      team_short_name: string | null;
      team_external_id: number;
    }>(
      `
      SELECT
        t.id AS team_id,
        t.name AS team_name,
        t.short_name AS team_short_name,
        t.external_team_id AS team_external_id
      FROM user_favorite_teams uft
      JOIN teams t ON t.id = uft.team_id
      WHERE uft.user_id = $1
      ORDER BY uft.created_at DESC
      `,
      [userId]
    );
  
    const favorites = favRes.rows;
    if (favorites.length === 0) {
      const err: any = new Error("No favorite teams yet");
      err.status = 400;
      throw err;
    }
  
    // 3) For each favorite team, fetch the next upcoming fixture from DB
    // We do one query per team for simplicity (favorites is small).
    const items: Array<{
      team: { id: number; name: string; shortName: string | null };
      fixture: null | {
        startTime: string;
        home: { name: string | null; shortName: string | null };
        away: { name: string | null; shortName: string | null };
      };
    }> = [];
  
    for (const fav of favorites) {
      const { rows } = await pool.query<UpcomingFixtureRow>(
        `
        SELECT
          m.id,
          m.start_time,
          m.status_text,
          m.short_status_text,
          m.home_team_external_id,
          m.away_team_external_id,
          m.home_score,
          m.away_score,
  
          th.name AS home_team_name,
          th.short_name AS home_team_short_name,
          ta.name AS away_team_name,
          ta.short_name AS away_team_short_name
  
        FROM matches m
        LEFT JOIN teams th ON th.external_team_id = m.home_team_external_id
        LEFT JOIN teams ta ON ta.external_team_id = m.away_team_external_id
  
        WHERE (m.home_team_external_id = $1 OR m.away_team_external_id = $1)
          AND LOWER(COALESCE(m.status_text, m.short_status_text, '')) <> 'ended'
          AND m.start_time > now()
  
        ORDER BY m.start_time ASC
        LIMIT 1
        `,
        [fav.team_external_id]
      );
  
      const next = rows[0];
  
      items.push({
        team: { id: fav.team_id, name: fav.team_name, shortName: fav.team_short_name },
        fixture: next
          ? {
              startTime: next.start_time,
              home: { name: next.home_team_name, shortName: next.home_team_short_name },
              away: { name: next.away_team_name, shortName: next.away_team_short_name },
            }
          : null,
      });
    }
  
    // 4) Send email (one email for all favorites)
    const sendResult = await sendFixtureDigestEmail(user.email, {
      timeZone: user.time_zone,
      items,
    });
  
    // 5) Return a small response for demo/debug
    return {
      sentTo: user.email,
      favorites: favorites.length,
      fixturesFound: items.filter((x) => x.fixture !== null).length,
      mode: (sendResult as any).mode,
    };
  }