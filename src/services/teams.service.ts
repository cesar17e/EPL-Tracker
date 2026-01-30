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

//*END OF HELPERS--> Helper function above

//!------NEW ENDPOINT------> ListTeams the "/" endpoint


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

//!------NEW ENDPOINT------> The teamId summary endpoint

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
//!------NEW ENDPOINT------> The get team matches endpoint


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

//!--------NEW ENDPOINT-------> Get team form endpoint

/**
 * Maps a recent vs baseline PPG(points per game) delta into a human readable "form" label
 *
 * Why PPG delta?
 * - Soccer is noisy in small samples.
 * - Comparing "recent performance" to a longer baseline is more stable than using a slope.
 *
 * Thresholds (deltaPPG):
 * - +0.40 or more  => Strong form  -->  (big improvement)
 * - +0.15 to +0.39 => Good form   -->   (noticeable improvement)
 * - -0.14 to +0.14 => Average form  --> (about normal)
 * - -0.39 to -0.15 => Poor form  -->    (noticeable drop)
 * - -0.40 or less  => Bad form     -->  (big drop)
 *
 */
function ppgRating(delta: number) {
  if (delta >= 0.4) return "Strong form";
  if (delta >= 0.15) return "Good form";
  if (delta > -0.15) return "Average form";
  if (delta > -0.4) return "Poor form";
  return "Bad form";
}


/**
 * Computes the population standard deviation of an array containing the points gotten for the teams recent N games.
 *
 * Used to quantify "volatility" in recent points:
 * - Stable teams: consistently earning similar points each match
 * - Volatile teams: big swings (W then L then W...)
 *
 * Points per match are usually {0,1,3} so sd is naturally bounded.
 */
function stddev(nums: number[]) {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length; //The sum of all points divided by the lenght the number of games essentially
  const varr = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length; //Calculating variance
  return Math.sqrt(varr); //Getting std dev
}

/**
 * Converts a points-per-match standard deviation into a simple volatility label.
 *
 * These thresholds are chosen to be easy to interpret:
 * - < 0.60  => Stable (mostly consistent results)
 * - < 1.10  => Moderate volatility
 * - >= 1.10 => High volatility (very streaky / unpredictable)
 *
 * Since match points are discrete (0/1/3), sd values tend to sit in this range.
 */
function volatilityLabel(sd: number) {
  if (sd < 0.6) return "Stable";
  if (sd < 1.1) return "Moderate volatility";
  return "High volatility";
}

/**
 * GET /api/teams/:teamId/form?matches=N
 *
 * Returns a "form" snapshot for a team!
 * - Recent W/D/L sequence (newest -> oldest)
 * - Total points & PPG (points per game)
 * - Goals for/against, goal difference, clean sheets
 * - Simple, explainable "form rating" using recent-vs-baseline comparison
 *
 * Form rating logic (robust for small samples):
 * - Recent window: last 5 matches (or fewer if not available)
 * - Baseline window: the next 10 matches after that (or fallback to overall average)
 * - deltaPPG = recentPPG - baselinePPG
 * - We label the delta using ppgRating()
 *
 * We also compute:
 * - volatility: standard deviation of recent match points (0/1/3)
 * - confirmation: compares deltaPPG with delta goal-difference per match
 *   (helps detect "results > performance" vs "performance-backed" improvement)
 */
export async function getTeamForm(teamId: number, opts: { matches: number }) {
  // 1) Load team to get external_team_id
  const teamRes = await pool.query<TeamRow>(
    `
    SELECT id, external_team_id, name
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

  // 2) Get last N ended matches (newest -> oldest)
  const { rows } = await pool.query<{
    winner: number | null;
    home_team_external_id: number;
    away_team_external_id: number;
    home_score: string | null;
    away_score: string | null;
    start_time: string;
    status_text: string | null;
    short_status_text: string | null;
  }>(
    `
    SELECT
      winner,
      home_team_external_id,
      away_team_external_id,
      home_score,
      away_score,
      start_time,
      status_text,
      short_status_text
    FROM matches
    WHERE (home_team_external_id = $1 OR away_team_external_id = $1)
      AND LOWER(COALESCE(status_text, short_status_text, '')) = 'ended'
    ORDER BY start_time DESC
    LIMIT $2
    `,
    [teamExternalId, opts.matches]
  );

  // If team has no ended matches yet, return an "empty" snapshot
  if (rows.length === 0) {
    return {
      teamId: team.id,
      matches: 0,
      form: [] as string[],
      points: 0,
      ppg: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      cleanSheets: 0,
      avgGoalsFor: 0,
      avgGoalsAgainst: 0,
      formRating: null,
    };
  }

  // 3) Convert each match into per-match stats type
  type PerMatch = {
    points: number;
    gf: number;
    ga: number;
    gd: number;
    result: "W" | "D" | "L";
  };

  const perMatch: PerMatch[] = []; //Array that holds perMatch types

  for (const m of rows) {
    const teamIsHome = m.home_team_external_id === teamExternalId;

    // If DB has null scores for an ended match, treat as 0 to keep calculations safe.
    const homeScore = numOrNull(m.home_score) ?? 0;
    const awayScore = numOrNull(m.away_score) ?? 0;

    const gf = teamIsHome ? homeScore : awayScore;
    const ga = teamIsHome ? awayScore : homeScore;
    const gd = gf - ga;

    const r = getTeamResultForMatch(m, teamExternalId);
    if (!r) continue; // defensive: should not happen for ended matches

    const points = r === "W" ? 3 : r === "D" ? 1 : 0;

    perMatch.push({ points, gf, ga, gd, result: r });
  }

  // If something weird happened and we couldn't compute results
  if (perMatch.length === 0) {
    return {
      teamId: team.id,
      matches: rows.length,
      form: [] as string[],
      points: 0,
      ppg: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      cleanSheets: 0,
      avgGoalsFor: 0,
      avgGoalsAgainst: 0,
      formRating: null,
    };
  }

  // 4) Overall aggregates across requested matches
  const points = perMatch.reduce((a, x) => a + x.points, 0);
  const gf = perMatch.reduce((a, x) => a + x.gf, 0);
  const ga = perMatch.reduce((a, x) => a + x.ga, 0);
  const gd = gf - ga;

  const n = perMatch.length;
  const ppg = points / n;

  const cleanSheets = perMatch.reduce((a, x) => a + (x.ga === 0 ? 1 : 0), 0);

  // W/D/L sequence (newest -> oldest)
  const form = perMatch.map((x) => x.result);

  // 5) Recent vs baseline split-window comparison 
  const RECENT_N = Math.min(5, n);
  const BASELINE_N = Math.min(10, Math.max(0, n - RECENT_N));

  const recent = perMatch.slice(0, RECENT_N);
  const baseline = perMatch.slice(RECENT_N, RECENT_N + BASELINE_N);

  const recentPoints = recent.reduce((a, x) => a + x.points, 0);
  const recentPPG = RECENT_N ? recentPoints / RECENT_N : 0;
  const recentGDPM = RECENT_N ? recent.reduce((a, x) => a + x.gd, 0) / RECENT_N : 0;

  // If we don't have enough baseline matches, fall back to overall average
  const baselinePPG =
    baseline.length > 0 ? baseline.reduce((a, x) => a + x.points, 0) / baseline.length : ppg;

  const baselineGDPM =
    baseline.length > 0 ? baseline.reduce((a, x) => a + x.gd, 0) / baseline.length : gd / n;

  const deltaPPG = recentPPG - baselinePPG;

  // Volatility based on recent points (0/1/3)
  const recentStd = stddev(recent.map((x) => x.points));

  // Confirmation using goal-difference per match (helps detect "lucky" vs "real" improvement)
  const deltaGDPM = recentGDPM - baselineGDPM;
  const confirmation =
    deltaPPG > 0 && deltaGDPM < 0
      ? "Results > performance"
      : deltaPPG > 0 && deltaGDPM >= 0
      ? "Performance-backed"
      : deltaPPG < 0 && deltaGDPM < 0
      ? "Consistently struggling"
      : "Mixed";

  // 6) Final API response
  return {
    teamId: team.id,
    matches: n,

    // raw descriptive stats
    form,
    points,
    ppg: Number(ppg.toFixed(2)),
    gf,
    ga,
    gd,
    cleanSheets,
    avgGoalsFor: Number((gf / n).toFixed(2)),
    avgGoalsAgainst: Number((ga / n).toFixed(2)),

    // interpretive "form rating"
    formRating: {
      recentMatches: RECENT_N,
      baselineMatches: baseline.length || n,
      recentPPG: Number(recentPPG.toFixed(2)),
      baselinePPG: Number(baselinePPG.toFixed(2)),
      deltaPPG: Number(deltaPPG.toFixed(2)),
      rating: ppgRating(deltaPPG),
      volatility: {
        recentPointsStd: Number(recentStd.toFixed(2)),
        label: volatilityLabel(recentStd),
      },
      confirmation,
      deltaGDPerMatch: Number(deltaGDPM.toFixed(2)),
    },
  };
}

//!---NEW ENDPOINT------> Get trends endpoint


/**
 * Computes rolling "trend" metrics for a team based on recent finished matches.
 *
 * It builds time-series data (arrays) that show how a team's recent performance changes over time using a sliding window.
 *
 * Example:
 *   opts.matches = 20  -->  use last 20 finished matches as input
 *   opts.window  = 5  --> compute rolling stats over 5-game windows
 *
 * For each consecutive window of window matches, we compute:
 *   - Points per game (PPG)
 *   - Goal difference per match
 *   - Goals for per match
 *   - Goals against per match
 * 
 *   - "5-game rolling PPG"
 *   - "5-game rolling goals per match"
 * 
 * A rolling window means:
- Look at 5 matches
- Compute stats
- Move forward 1 match
- Repeat until you run out of matches

 * *
 * Returns:
 *   {
 *     teamId: number,
 *     matches: number,               // total matches used
 *     window: number,                // rolling window size
 *     labels: string[],              // dates (end of each window)
 *     ppgSeries: number[],           // PPG over each window
 *     gdPerMatchSeries: number[],    // goal diff per match
 *     gfPerMatchSeries: number[],    // goals for per match
 *     gaPerMatchSeries: number[]     // goals against per match
 *   }
 */

export async function getTeamTrends(
  teamId: number,
  opts: { matches: number; window: number }
) {
  // 1) Load team for external id
  const teamRes = await pool.query<TeamRow>(
    `SELECT id, external_team_id, name FROM teams WHERE id = $1`,
    [teamId]
  );

  const team = teamRes.rows[0];
  if (!team) {
    const err: any = new Error("Team not found");
    err.status = 404;
    throw err;
  }

  const teamExternalId = team.external_team_id;

  // 2) Pull last N ended matches (DESC newest -> oldest)
  const { rows } = await pool.query<{
    winner: number | null;
    home_team_external_id: number;
    away_team_external_id: number;
    home_score: string | null;
    away_score: string | null;
    start_time: string;
  }>(
    `
    SELECT
      winner,
      home_team_external_id,
      away_team_external_id,
      home_score,
      away_score,
      start_time
    FROM matches
    WHERE (home_team_external_id = $1 OR away_team_external_id = $1)
      AND LOWER(COALESCE(status_text, short_status_text, '')) = 'ended'
    ORDER BY start_time DESC
    LIMIT $2
    `,
    [teamExternalId, opts.matches]
  );

  // If not enough data return an empty set UI deals with it
  if (rows.length < opts.window) {
    return {
      teamId: team.id,
      matches: rows.length,
      window: opts.window,
      pointsSeries: [],
      ppgSeries: [],
      gdSeries: [],
      gfSeries: [],
      gaSeries: [],
      labels: [],
    };
  }

  // 3) Convert to per-match stats
  //Since we did order by desc of start time of the game so we got back new to old but we reverse here to get games from old to new
  const chronological = [...rows].reverse();

  type MatchStat = {
    date: string; // ISO string from DB (start time)
    points: number;
    gf: number;
    ga: number;
    gd: number;
  };

  
 //Converts each match into a per-match stat object. We put it in this new array called stats
  const stats: MatchStat[] = chronological.map((m) => {
    const teamIsHome = m.home_team_external_id === teamExternalId;
    const homeScore = numOrNull(m.home_score) ?? 0;
    const awayScore = numOrNull(m.away_score) ?? 0;

    const gf = teamIsHome ? homeScore : awayScore;
    const ga = teamIsHome ? awayScore : homeScore;
    const gd = gf - ga;

    const r = getTeamResultForMatch(m, teamExternalId);
    const points = r === "W" ? 3 : r === "D" ? 1 : 0;

    return { date: m.start_time, points, gf, ga, gd };
  });

  // Rolling window helper
  const roll = (arr: MatchStat[], window: number, pick: (x: MatchStat) => number) => {
    const out: number[] = [];
    for (let i = 0; i <= arr.length - window; i++) {
      let sum = 0;
      for (let j = i; j < i + window; j++) sum += pick(arr[j]!); //Even if it is null we set it to 0 above
      out.push(sum);
    }
    return out;
  };

  const w = opts.window;

  // Rolling totals over the last window games at each point
  const rollingPoints = roll(stats, w, (x) => x.points);
  const rollingGf = roll(stats, w, (x) => x.gf);
  const rollingGa = roll(stats, w, (x) => x.ga);
  const rollingGd = roll(stats, w, (x) => x.gd);

  // Convert to per-game averages 
  const rollingPpg = rollingPoints.map((x) => Number((x / w).toFixed(2)));
  const gdPerMatch = rollingGd.map((x) => Number((x / w).toFixed(2)));
  const gfPerMatch = rollingGf.map((x) => Number((x / w).toFixed(2)));
  const gaPerMatch = rollingGa.map((x) => Number((x / w).toFixed(2)));

  // labels correspond to the END of each window (nice for charts)
  const labels = stats.slice(w - 1).map((x) => x.date);

  return {
    teamId: team.id,
    matches: stats.length,
    window: w,
    labels, // same length as each series below
    ppgSeries: rollingPpg,
    gdPerMatchSeries: gdPerMatch,
    gfPerMatchSeries: gfPerMatch,
    gaPerMatchSeries: gaPerMatch,
  };
}

