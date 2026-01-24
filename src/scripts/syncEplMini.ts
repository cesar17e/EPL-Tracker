// src/scripts/syncEplMini.ts
//
// EPL “mini sync” job (admin-triggered):
// - Keeps DB fresh without re-seeding the whole season.
// - Per team: upserts last N finished results + next N upcoming fixtures.
// - Uses /games/results for past games and /games/fixtures for future games.
// - Dedupes by external game id across all teams (each match appears for 2 teams).
// - Safe to run repeatedly: UPSERT by matches.external_game_id.
//
// Why this exists even though it still makes about 40 API calls:
// - We avoid heavy DB writes and huge datasets (no full historical backfill).
// - We only store what the app needs for UI “recent + upcoming” sections.

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined,
});

const API_KEY = process.env.SPORTS_API_KEY;
const BASE = "https://v1.football.sportsapipro.com";
const EPL_ID = 7;

// EPL teams (external competitor IDs)
const EPL_TEAMS: number[] = [
  110, 15, 114, 108, 120, 116, 36, 29, 113, 10,
  106, 104, 12, 107, 63, 50, 109, 117, 38, 105,
];

// How many to keep per team
const LAST_RESULTS = Number(process.env.LAST_RESULTS ?? 3);
const NEXT_FIXTURES = Number(process.env.NEXT_FIXTURES ?? 3);

// Lookback guard for results (avoid pulling very old matches)
const RESULTS_LOOKBACK_DAYS = Number(process.env.RESULTS_LOOKBACK_DAYS ?? 45);

// API call guard (2 calls per team => 40 calls)
const MAX_API_CALLS = Number(process.env.MAX_API_CALLS ?? 100);

type ApiCompetitor = {
  id: number;
  score?: number;
  isWinner?: boolean;
};

type ApiGame = {
  id: number;
  competitionId: number;
  seasonNum?: number;
  stageNum?: number;
  groupNum?: number;
  roundName?: string;
  groupName?: string;
  startTime: string; // ISO
  statusGroup: number;
  statusText?: string;
  shortStatusText?: string;
  homeCompetitor: ApiCompetitor;
  awayCompetitor: ApiCompetitor;
  hasLineups?: boolean;
  hasStats?: boolean;
  hasNews?: boolean;
};

type ApiResponse = { games?: ApiGame[] };

function normalizeScore(score: unknown): number | null {
  if (score == null) return null;
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  // API often uses -1 for "not played"
  if (n < 0) return null;
  return n;
}

// Docs you pasted:
// 1 scheduled, 2 live, 3 live, 4 ended, 5 postponed, 6 cancelled
function isEnded(statusGroup: number): boolean {
  return statusGroup === 4;
}

// treat only 1/2/3 as "upcoming-ish"; exclude 5/6
function isUpcomingish(statusGroup: number): boolean {
  return statusGroup === 1 || statusGroup === 2 || statusGroup === 3;
}

/**
 * Winner encoding for DB:
 * 1 = home, 2 = away, 0 = draw, null = unknown / not-ended / missing scores
 */
function computeWinner(
  game: ApiGame,
  homeScore: number | null,
  awayScore: number | null
): number | null {
  if (!isEnded(game.statusGroup)) return null;
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return 1;
  if (awayScore > homeScore) return 2;
  return 0;
}

function isTeamInGame(g: ApiGame, teamId: number): boolean {
  return g.homeCompetitor?.id === teamId || g.awayCompetitor?.id === teamId;
}

function filterToEplAndTeam(gamesRaw: ApiGame[], teamId: number): ApiGame[] {
  return gamesRaw.filter((g) => {
    if (!g?.startTime) return false;
    if (g.competitionId !== EPL_ID) return false;
    return isTeamInGame(g, teamId);
  });
}

function pickLastResults(games: ApiGame[]): ApiGame[] {
  const now = Date.now();
  const lookbackMs = RESULTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  return games
    .filter((g) => isEnded(g.statusGroup))
    .filter((g) => {
      const t = new Date(g.startTime).getTime();
      return t <= now && t >= now - lookbackMs;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, LAST_RESULTS);
}

function pickNextFixtures(games: ApiGame[]): ApiGame[] {
  const now = Date.now();

  return games
    .filter((g) => new Date(g.startTime).getTime() > now)
    .filter((g) => isUpcomingish(g.statusGroup)) // exclude postponed/cancelled
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, NEXT_FIXTURES);
}

async function apiGet<T>(pathAndQuery: string): Promise<T> {
  if (!API_KEY) throw new Error("Missing API key. Set SPORTS_API_KEY in .env");
  const url = `${BASE}${pathAndQuery}`;

  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }
  return (await res.json()) as T;
}

async function upsertMatch(game: ApiGame): Promise<void> {
  const external_game_id = game.id;
  const external_competition_id = game.competitionId;

  const home_team_external_id = game.homeCompetitor?.id;
  const away_team_external_id = game.awayCompetitor?.id;

  // required by your schema
  if (
    !external_game_id ||
    !external_competition_id ||
    !home_team_external_id ||
    !away_team_external_id ||
    !game.startTime ||
    typeof game.statusGroup !== "number"
  ) {
    return;
  }

  const homeScore = normalizeScore(game.homeCompetitor?.score);
  const awayScore = normalizeScore(game.awayCompetitor?.score);
  const winner = computeWinner(game, homeScore, awayScore);

  const has_lineups =
    typeof game.hasLineups === "boolean" ? game.hasLineups : null;
  const has_stats = typeof game.hasStats === "boolean" ? game.hasStats : null;
  const has_news = typeof game.hasNews === "boolean" ? game.hasNews : null;

  await pool.query(
    `
    INSERT INTO matches (
      external_game_id,
      external_competition_id,
      season_num,
      stage_num,
      group_num,
      round_name,
      group_name,
      start_time,
      status_group,
      status_text,
      short_status_text,
      home_team_external_id,
      away_team_external_id,
      home_score,
      away_score,
      winner,
      has_lineups,
      has_stats,
      has_news,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now()
    )
    ON CONFLICT (external_game_id)
    DO UPDATE SET
      external_competition_id = EXCLUDED.external_competition_id,
      season_num = EXCLUDED.season_num,
      stage_num = EXCLUDED.stage_num,
      group_num = EXCLUDED.group_num,
      round_name = EXCLUDED.round_name,
      group_name = EXCLUDED.group_name,
      start_time = EXCLUDED.start_time,
      status_group = EXCLUDED.status_group,
      status_text = EXCLUDED.status_text,
      short_status_text = EXCLUDED.short_status_text,
      home_team_external_id = EXCLUDED.home_team_external_id,
      away_team_external_id = EXCLUDED.away_team_external_id,
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      winner = EXCLUDED.winner,
      has_lineups = EXCLUDED.has_lineups,
      has_stats = EXCLUDED.has_stats,
      has_news = EXCLUDED.has_news,
      updated_at = now()
    `,
    [
      external_game_id,
      external_competition_id,
      game.seasonNum ?? null,
      game.stageNum ?? null,
      game.groupNum ?? null,
      game.roundName ?? null,
      game.groupName ?? null,
      game.startTime,
      game.statusGroup,
      game.statusText ?? null,
      game.shortStatusText ?? null,
      home_team_external_id,
      away_team_external_id,
      homeScore,
      awayScore,
      winner,
      has_lineups,
      has_stats,
      has_news,
    ]
  );
}

async function main() {
  console.log("EPL mini sync (last results + next fixtures per team)");
  console.log(`Per team: last ${LAST_RESULTS} ended + next ${NEXT_FIXTURES} upcoming`);
  console.log(`Lookback: ${RESULTS_LOOKBACK_DAYS} days | Max API calls: ${MAX_API_CALLS}`);
  console.log("");

  let apiCalls = 0;

  // dedupe across teams (each match shows up twice)
  const byId = new Map<number, ApiGame>();

  for (const teamId of EPL_TEAMS) {
    // 2 calls per team
    if (apiCalls + 2 > MAX_API_CALLS) {
      console.log("Reached API call limit guard. Stopping.");
      break;
    }

    console.log(`📡 Team ${teamId}`);

    const fx = await apiGet<ApiResponse>(
      `/games/fixtures?competitors=${teamId}&showOdds=false`
    );
    apiCalls++;

    const rs = await apiGet<ApiResponse>(
      `/games/results?competitors=${teamId}&showOdds=false`
    );
    apiCalls++;

    const fixturesGames = filterToEplAndTeam(Array.isArray(fx.games) ? fx.games : [], teamId);
    const resultsGames = filterToEplAndTeam(Array.isArray(rs.games) ? rs.games : [], teamId);

    const nextFixtures = pickNextFixtures(fixturesGames);
    const lastResults = pickLastResults(resultsGames);

    for (const g of [...lastResults, ...nextFixtures]) {
      if (g?.id != null) byId.set(g.id, g);
    }

    console.log(
      `   → added: results=${lastResults.length}, fixtures=${nextFixtures.length} | unique total=${byId.size}`
    );
  }

  const all = Array.from(byId.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  console.log(`\nUpserting ${all.length} matches...`);

  let ok = 0;
  let failed = 0;

  await pool.query("BEGIN");
  try {
    for (const g of all) {
      try {
        await upsertMatch(g);
        ok++;
      } catch (e: any) {
        failed++;
        console.warn(`Upsert failed gameId=${g.id}: ${e?.message || e}`);
      }
    }
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  } finally {
    await pool.end();
  }

  console.log("\nDone");
  console.log("API calls used:", apiCalls);
  console.log("Unique matches processed:", all.length);
  console.log("Inserted/updated:", ok);
  console.log("Failed:", failed);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
