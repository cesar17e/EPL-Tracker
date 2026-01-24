/**
 * Seed / sync Premier League matches into my `matches` table.
 *
 * Run:
 *   npx tsx src/scripts/seedPremMatches.ts
 *
 * I will manually re-render this file myself, for new seasons, we have another sync script to manage 3 last game results and upcoming 3 games
 */

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
});

const API_KEY = process.env.SPORTS_API_KEY;
  
const BASE = "https://v1.football.sportsapipro.com";

const EPL_ID = Number(process.env.EPL_ID ?? 7);

const EPL_TEAMS: number[] = [
  110, 15, 114, 108, 120, 116, 36, 29, 113, 10,
  106, 104, 12, 107, 63, 50, 109, 117, 38, 105
];

const START = new Date(process.env.EPL_START_ISO || "2025-08-15T00:00:00Z");
const END   = new Date(process.env.EPL_END_ISO   || "2026-03-15T23:59:59Z");

const MAX_API_CALLS = Number(process.env.MAX_API_CALLS || 100);

// ---- Types (minimal) ----
type ApiCompetitor = {
  id: number;
  name?: string;
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
  startTime: string;
  statusGroup: number;
  statusText?: string;
  shortStatusText?: string;
  homeCompetitor: ApiCompetitor;
  awayCompetitor: ApiCompetitor;
  hasLineups?: boolean;
  hasStats?: boolean;
  hasNews?: boolean;
};

type ApiResponse = {
  games?: ApiGame[];
  competitionFilters?: Array<{ id: number; name?: string }>;
};

// ---- Helpers ----
function inWindow(iso: string): boolean {
  const t = new Date(iso).getTime();
  return t >= START.getTime() && t <= END.getTime();
}

function normalizeScore(score: unknown): number | null {
  if (score == null) return null;
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null; // API uses -1 for "not played"
  return n;
}

function isFinished(statusGroup: number): boolean {
  return statusGroup === 4; // Ended (per api docs)
}

/**
 * Winner encoding:
 * 1 = home, 2 = away, 0 = draw, null = unknown/not-finished/undeterminable
 */
function computeWinnerWithFallback(game: ApiGame, homeScore: number | null, awayScore: number | null): number | null {
  if (!isFinished(game.statusGroup)) return null;

  if (homeScore != null && awayScore != null) {
    if (homeScore > awayScore) return 1;
    if (awayScore > homeScore) return 2;
    return 0;
  }

  const homeIW = !!game.homeCompetitor?.isWinner;
  const awayIW = !!game.awayCompetitor?.isWinner;

  if (homeIW && !awayIW) return 1;
  if (awayIW && !homeIW) return 2;

  return null;
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

function extractEplCompIdsFromFilters(data: ApiResponse): Set<number> {
  const filters = Array.isArray(data.competitionFilters) ? data.competitionFilters : [];
  const epl = filters.find(f => (f?.name || "").toLowerCase() === "premier league");
  if (epl?.id) return new Set([epl.id]);
  return new Set(); // IMPORTANT: return empty if not found (so we can prefer the other response)
}

function filterEplGames(games: ApiGame[], eplCompIds: Set<number>): ApiGame[] {
  return games.filter(g => {
    if (!g?.startTime || !inWindow(g.startTime)) return false;
    if (eplCompIds.size === 0) return g.competitionId === EPL_ID; // fallback to known EPL_ID
    return eplCompIds.has(g.competitionId);
  });
}

// ---- DB upsert ----
async function upsertMatch(game: ApiGame): Promise<void> {
  const external_game_id = game.id;
  const external_competition_id = game.competitionId;

  const home_team_external_id = game.homeCompetitor?.id;
  const away_team_external_id = game.awayCompetitor?.id;

  if (!external_game_id || !external_competition_id || !home_team_external_id || !away_team_external_id) return;

  const homeScore = normalizeScore(game.homeCompetitor?.score);
  const awayScore = normalizeScore(game.awayCompetitor?.score);
  const computedWinner = computeWinnerWithFallback(game, homeScore, awayScore);

  const q = `
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
  `;

  const has_lineups = typeof game.hasLineups === "boolean" ? game.hasLineups : null;
  const has_stats = typeof game.hasStats === "boolean" ? game.hasStats : null;
  const has_news = typeof game.hasNews === "boolean" ? game.hasNews : null;

  await pool.query(q, [
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
    computedWinner,
    has_lineups,
    has_stats,
    has_news,
  ]);
}

async function main() {
  console.log("Seeding EPL matches into DB");
  console.log(`Window: ${START.toISOString()} → ${END.toISOString()}`);
  console.log(`Teams: ${EPL_TEAMS.length}`);
  console.log(`Max API calls guard: ${MAX_API_CALLS}`);
  console.log("");

  const byId = new Map<number, ApiGame>();
  let apiCalls = 0;

  for (const teamId of EPL_TEAMS) {
    //Guard enforced (2 calls per team)
    if (apiCalls + 2 > MAX_API_CALLS) {
      console.log("Reached API call limit guard. Stopping.");
      break;
    }

    console.log(`📡 Team ${teamId}: fixtures + results`);

    const fixtures = await apiGet<ApiResponse>(`/games/fixtures?competitors=${teamId}&showOdds=false`);
    apiCalls++;

    const results = await apiGet<ApiResponse>(`/games/results?competitors=${teamId}&showOdds=false`);
    apiCalls++;

    //Prefer the response whose filters actually include EPL
    const fxIds = extractEplCompIdsFromFilters(fixtures);
    const rsIds = extractEplCompIdsFromFilters(results);
    const eplIds = (rsIds.size ? rsIds : fxIds);

    const fixtureGames = filterEplGames(Array.isArray(fixtures.games) ? fixtures.games : [], eplIds);
    const resultGames  = filterEplGames(Array.isArray(results.games) ? results.games : [], eplIds);

    for (const g of [...fixtureGames, ...resultGames]) {
      if (g?.id != null) byId.set(g.id, g);
    }

    console.log(`   → EPL fixtures in window: ${fixtureGames.length}`);
    console.log(`   → EPL results  in window: ${resultGames.length}`);
    console.log(`   → unique games so far: ${byId.size}`);
  }

  const all = Array.from(byId.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  console.log("\nUpserting matches......");
  let ok = 0;
  let failed = 0;

  for (const g of all) {
    try {
      await upsertMatch(g);
      ok++;
    } catch (e: any) {
      failed++;
      console.warn(`⚠️ Failed upsert gameId=${g.id}: ${e?.message || e}`);
    }
  }

  console.log("\nDone");
  console.log("API calls used:", apiCalls);
  console.log("Unique EPL games processed:", all.length);
  console.log("Inserted/updated:", ok);
  console.log("Failed:", failed);

  await pool.end();
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
