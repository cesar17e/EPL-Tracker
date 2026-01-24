import { pool } from "../db/pool.js";

/**
 * Represents a row from the `teams` table.
 * This is the minimal set of fields we need for user-facing endpoints.
 */
type TeamRow = {
  id: number;                    // internal DB id
  external_team_id: number;      // external API team id (used in matches)
  name: string;
  short_name: string | null;
  color: string | null;
  away_color: string | null;
  image_version: number | null;
};

/**
 * Represents a joined match row:
 * - data from `matches`
 * - joined home team (th)
 * - joined away team (ta)
 *
 * Used for team summary views so the frontend doesn't need extra calls.
 */
type MatchRowJoined = {
  id: number;
  external_game_id: number;
  start_time: string; // numeric/timestamp fields come back as strings in node-postgres
  status_text: string | null;
  short_status_text: string | null;
  status_group: number;

  home_team_external_id: number;
  away_team_external_id: number;

  home_score: string | null; // numeric → string
  away_score: string | null;

  // winner encoding:
  // 1 = home win, 2 = away win, 0 = draw, null = not ended
  winner: number | null;

  // Joined home team fields
  home_team_id: number | null;
  home_team_name: string | null;
  home_team_short_name: string | null;
  home_team_color: string | null;
  home_team_away_color: string | null;
  home_team_image_version: number | null;

  // Joined away team fields
  away_team_id: number | null;
  away_team_name: string | null;
  away_team_short_name: string | null;
  away_team_color: string | null;
  away_team_away_color: string | null;
  away_team_image_version: number | null;
};

/**
 * Determines whether a match is finished.
 * The DB uses `status_text = "Ended"` for completed matches.
 */
function isEnded(m: { status_text: string | null; short_status_text: string | null }) {
  const s = (m.status_text ?? m.short_status_text ?? "").toLowerCase();
  return s === "ended";
}

/**
 * Converts Postgres numeric strings into numbers.
 * Returns null if the value is null or not a valid number.
 */
function numOrNull(x: string | null) {
  if (x === null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Computes the result of a match from the perspective of a specific team.
 *
 * winner encoding:
 * 1 = home win
 * 2 = away win
 * 0 = draw
 * null = match not ended
 */
function getTeamResultForMatch(
  match: {
    winner: number | null;
    home_team_external_id: number;
    away_team_external_id: number;
  },
  teamExternalId: number
): "W" | "D" | "L" | null {
  if (match.winner === null) return null;
  if (match.winner === 0) return "D"; // draw

  const teamIsHome = match.home_team_external_id === teamExternalId;

  if (match.winner === 1) return teamIsHome ? "W" : "L"; // home won
  if (match.winner === 2) return teamIsHome ? "L" : "W"; // away won

  return null;
}

/**
 * Maps a joined team row into a compact object for API responses.
 * Returns null if the team does not exist (defensive safety).
 */
function mapTeamMini(row: {
  team_id: number | null;
  team_name: string | null;
  team_short_name: string | null;
  team_color: string | null;
  team_away_color: string | null;
  team_image_version: number | null;
}) {
  if (!row.team_id) return null;

  return {
    id: row.team_id,
    name: row.team_name,
    shortName: row.team_short_name,
    color: row.team_color,
    awayColor: row.team_away_color,
    imageVersion: row.team_image_version,
  };
}

/**
 * Returns all teams.
 * Used for the home page team list after login.
 */
export async function listTeams() {
  const { rows } = await pool.query<TeamRow>(
    `
    SELECT
      id,
      external_team_id,
      name,
      short_name,
      color,
      away_color,
      image_version
    FROM teams
    ORDER BY COALESCE(popularity_rank, 999999999) ASC, name ASC
    `
  );

  return rows.map((t) => ({
    id: t.id,
    externalTeamId: t.external_team_id,
    name: t.name,
    shortName: t.short_name,
    color: t.color,
    awayColor: t.away_color,
    imageVersion: t.image_version,
  }));
}

/**
 * Returns a team summary:
 * - team metadata
 * - last N completed matches
 * - next N upcoming fixtures
 */
export async function getTeamSummary(
  teamId: number,
  opts: { lastResultsLimit: number; nextFixturesLimit: number }
) {
  /**
   * 1) Load the team using its internal ID.
   * We then use the external_team_id to query matches.
   */
  const teamRes = await pool.query<TeamRow>(
    `
    SELECT
      id,
      external_team_id,
      name,
      short_name,
      color,
      away_color,
      image_version
    FROM teams
    WHERE id = $1
    `,
    [teamId]
  );

  const team = teamRes.rows[0];
  if (!team) {
    const err: any = new Error("Team not found");
    err.status = 404;
    throw err;
  }

  const teamExternalId = team.external_team_id;

  /**
   * Shared base SELECT for both results and fixtures.
   * Joins teams twice so frontend gets opponent info immediately.
   */
  const baseSelect = `
    SELECT
      m.id,
      m.external_game_id,
      m.start_time,
      m.status_text,
      m.short_status_text,
      m.status_group,
      m.home_team_external_id,
      m.away_team_external_id,
      m.home_score,
      m.away_score,
      m.winner,

      th.id AS home_team_id,
      th.name AS home_team_name,
      th.short_name AS home_team_short_name,
      th.color AS home_team_color,
      th.away_color AS home_team_away_color,
      th.image_version AS home_team_image_version,

      ta.id AS away_team_id,
      ta.name AS away_team_name,
      ta.short_name AS away_team_short_name,
      ta.color AS away_team_color,
      ta.away_color AS away_team_away_color,
      ta.image_version AS away_team_image_version
    FROM matches m
    LEFT JOIN teams th ON th.external_team_id = m.home_team_external_id
    LEFT JOIN teams ta ON ta.external_team_id = m.away_team_external_id
    WHERE (m.home_team_external_id = $1 OR m.away_team_external_id = $1)
  `;

  /**
   * 2) Last completed matches (Ended)
   */
  const lastResultsRes = await pool.query<MatchRowJoined>(
    `
    ${baseSelect}
      AND LOWER(COALESCE(m.status_text, m.short_status_text, '')) = 'ended'
    ORDER BY m.start_time DESC
    LIMIT $2
    `,
    [teamExternalId, opts.lastResultsLimit]
  );

  /**
   * 3) Upcoming fixtures (Not ended)
   */
  const nextFixturesRes = await pool.query<MatchRowJoined>(
    `
    ${baseSelect}
      AND LOWER(COALESCE(m.status_text, m.short_status_text, '')) <> 'ended'
    ORDER BY m.start_time ASC
    LIMIT $2
    `,
    [teamExternalId, opts.nextFixturesLimit]
  );

  /**
   * Normalizes a DB row into an API-friendly match object.
   */
  const mapMatch = (m: MatchRowJoined) => {
    const homeTeam = mapTeamMini({
      team_id: m.home_team_id,
      team_name: m.home_team_name,
      team_short_name: m.home_team_short_name,
      team_color: m.home_team_color,
      team_away_color: m.home_team_away_color,
      team_image_version: m.home_team_image_version,
    });

    const awayTeam = mapTeamMini({
      team_id: m.away_team_id,
      team_name: m.away_team_name,
      team_short_name: m.away_team_short_name,
      team_color: m.away_team_color,
      team_away_color: m.away_team_away_color,
      team_image_version: m.away_team_image_version,
    });

    const ended = isEnded(m);
    const teamIsHome = m.home_team_external_id === teamExternalId;

    return {
      id: m.id,
      externalGameId: m.external_game_id,
      startTime: m.start_time,
      statusText: m.status_text ?? m.short_status_text,
      ended,

      homeTeam,
      awayTeam,

      homeScore: numOrNull(m.home_score),
      awayScore: numOrNull(m.away_score),

      winner: m.winner,
      perspective: {
        teamIsHome,
        // W/D/L from THIS team's perspective
        result: ended ? getTeamResultForMatch(m, teamExternalId) : null,
      },
    };
  };

  /**
   * Final API response
   */
  return {
    team: {
      id: team.id,
      externalTeamId: team.external_team_id,
      name: team.name,
      shortName: team.short_name,
      color: team.color,
      awayColor: team.away_color,
      imageVersion: team.image_version,
    },
    lastResults: lastResultsRes.rows.map(mapMatch),
    nextFixtures: nextFixturesRes.rows.map(mapMatch),
  };
}

//Get all fixtures for a team logic

export async function getTeamMatches(
  teamId: number,
  opts: { type: "all" | "results" | "fixtures"; limit: number }
) {
  // 1) Load team to get external id
  const teamRes = await pool.query<TeamRow>(
    `
    SELECT id, external_team_id, name, short_name, color, away_color, image_version
    FROM teams
    WHERE id = $1
    `,
    [teamId]
  );

  const team = teamRes.rows[0];
  if (!team) {
    const err: any = new Error("Team not found");
    err.status = 404;
    throw err;
  }

  const teamExternalId = team.external_team_id;

  // 2) Build a WHERE filter based on "type"
  // Ended is based on status_text/short_status_text = "Ended"
  const endedClause =
    "LOWER(COALESCE(m.status_text, m.short_status_text, '')) = 'ended'";
  const notEndedClause =
    "LOWER(COALESCE(m.status_text, m.short_status_text, '')) <> 'ended'";

  let typeFilterSql = "";
  let orderBySql = "ORDER BY m.start_time DESC"; // default for "all" + "results"
  if (opts.type === "results") {
    typeFilterSql = `AND ${endedClause}`;
    orderBySql = "ORDER BY m.start_time DESC"; // most recent first
  } else if (opts.type === "fixtures") {
    typeFilterSql = `AND ${notEndedClause}`;
    orderBySql = "ORDER BY m.start_time ASC"; // upcoming soonest first
  } else {
    // "all"
    // keep DESC so most recent games are first (common UX)
    typeFilterSql = "";
    orderBySql = "ORDER BY m.start_time DESC";
  }

  const { rows } = await pool.query<MatchRowJoined>(
    `
    SELECT
      m.id,
      m.external_game_id,
      m.start_time,
      m.status_text,
      m.short_status_text,
      m.status_group,
      m.home_team_external_id,
      m.away_team_external_id,
      m.home_score,
      m.away_score,
      m.winner,

      th.id AS home_team_id,
      th.name AS home_team_name,
      th.short_name AS home_team_short_name,
      th.color AS home_team_color,
      th.away_color AS home_team_away_color,
      th.image_version AS home_team_image_version,

      ta.id AS away_team_id,
      ta.name AS away_team_name,
      ta.short_name AS away_team_short_name,
      ta.color AS away_team_color,
      ta.away_color AS away_team_away_color,
      ta.image_version AS away_team_image_version

    FROM matches m
    LEFT JOIN teams th ON th.external_team_id = m.home_team_external_id
    LEFT JOIN teams ta ON ta.external_team_id = m.away_team_external_id
    WHERE (m.home_team_external_id = $1 OR m.away_team_external_id = $1)
    ${typeFilterSql}
    ${orderBySql}
    LIMIT $2
    `,
    [teamExternalId, opts.limit]
  );

  // Reuse your mapMatch logic (copy/paste or extract into a helper)
  const mapMatch = (m: MatchRowJoined) => {
    const homeTeam = mapTeamMini({
      team_id: m.home_team_id,
      team_name: m.home_team_name,
      team_short_name: m.home_team_short_name,
      team_color: m.home_team_color,
      team_away_color: m.home_team_away_color,
      team_image_version: m.home_team_image_version,
    });

    const awayTeam = mapTeamMini({
      team_id: m.away_team_id,
      team_name: m.away_team_name,
      team_short_name: m.away_team_short_name,
      team_color: m.away_team_color,
      team_away_color: m.away_team_away_color,
      team_image_version: m.away_team_image_version,
    });

    const ended = isEnded(m);
    const teamIsHome = m.home_team_external_id === teamExternalId;

    return {
      id: m.id,
      externalGameId: m.external_game_id,
      startTime: m.start_time,
      statusText: m.status_text ?? m.short_status_text,
      ended,
      homeTeam,
      awayTeam,
      homeScore: numOrNull(m.home_score),
      awayScore: numOrNull(m.away_score),
      winner: m.winner,
      perspective: {
        teamIsHome,
        result: ended ? getTeamResultForMatch(m, teamExternalId) : null,
      },
    };
  };

  return {
    team: {
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      color: team.color,
      awayColor: team.away_color,
      imageVersion: team.image_version,
    },
    type: opts.type,
    limit: opts.limit,
    matches: rows.map(mapMatch),
  };
}

