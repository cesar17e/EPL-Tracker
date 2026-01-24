/**
 * Seed / sync Premier League teams into our `teams` table.

 * Run:
 *   npx tsx src/scripts/seedPremTeams.ts
 * 
 * I will manually re-render this file myself, for new seasons, we have another sync script to manage 3 last game results and upcoming 3 games
 */

import "dotenv/config";
import { pool } from "../db/pool.js";

type ApiCompetitor = {
  id: number | undefined;
  name: string;
  shortName?: string | undefined;
  symbolicName?: string | undefined;
  countryId?: number | undefined;
  sportId?: number | undefined;
  type?: number | undefined; // 1 club, 2 national team, etc.
  color?: string | undefined;
  awayColor?: string | undefined;
  imageVersion?: number | undefined;
  nameForURL?: string | undefined;
  popularityRank?: number | undefined;
  mainCompetitionId?: number | undefined;
};

type FixturesResponse = {
  competitors?: ApiCompetitor[];
  games?: Array<{
    homeCompetitor?: ApiCompetitor;
    awayCompetitor?: ApiCompetitor;
  }>;
  paging?: {
    nextPage?: string;
    previousPage?: string;
  };
};

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizeCompetitor(c: ApiCompetitor): ApiCompetitor {
  // Some fields may be missing depending on endpoint/plan – keep safe defaults.
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    symbolicName: c.symbolicName,
    countryId: c.countryId,
    sportId: c.sportId ?? 1, // football default
    type: c.type,
    color: c.color,
    awayColor: c.awayColor,
    imageVersion: c.imageVersion,
    nameForURL: c.nameForURL,
    popularityRank: c.popularityRank,
    mainCompetitionId: c.mainCompetitionId,
  };
}

async function fetchFixturesTeams(): Promise<ApiCompetitor[]> {
  const apiKey = mustGetEnv("SPORTS_API_KEY");

  const competitionId = Number(process.env.PREMIER_LEAGUE_COMPETITION_ID || "7");
  const startDate = process.env.START_DATE || "01/01/2025";
  const endDate = process.env.END_DATE || "31/01/2025";

  const url =
    `https://v1.football.sportsapipro.com/games/fixtures` +
    `?competitions=${competitionId}` +
    `&startDate=${encodeURIComponent(startDate)}` +
    `&endDate=${encodeURIComponent(endDate)}` +
    `&showOdds=false`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SportsAPI error: ${res.status} ${res.statusText}\n${text}`);
  }

  const data = (await res.json()) as FixturesResponse;

  // Prefer the dedicated competitors array if present (usually richer/cleaner).
  const map = new Map<number, ApiCompetitor>();

  if (Array.isArray(data.competitors) && data.competitors.length > 0) {
    for (const c of data.competitors) {
      if (!c?.id || !c?.name) continue;
      map.set(c.id, normalizeCompetitor(c));
    }
  } else if (Array.isArray(data.games)) {
    for (const g of data.games) {
      const home = g.homeCompetitor;
      const away = g.awayCompetitor;
      if (home?.id && home?.name) map.set(home.id, normalizeCompetitor(home));
      if (away?.id && away?.name) map.set(away.id, normalizeCompetitor(away));
    }
  }

  return [...map.values()];
}

async function upsertTeams(teams: ApiCompetitor[]) {
  if (teams.length === 0) {
    console.log("No teams found from API. Check your date range / endpoint.");
    return { insertedOrUpdated: 0 };
  }

  // One UPSERT per row is fine for 20 teams.
  // If you later expand to many leagues, we can batch-insert.
  const sql = `
    INSERT INTO teams (
      external_team_id,
      name,
      short_name,
      symbolic_name,
      country_id,
      sport_id,
      type,
      color,
      away_color,
      image_version,
      name_for_url,
      popularity_rank,
      main_competition_external_id,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
    )
    ON CONFLICT (external_team_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      short_name = EXCLUDED.short_name,
      symbolic_name = EXCLUDED.symbolic_name,
      country_id = EXCLUDED.country_id,
      sport_id = EXCLUDED.sport_id,
      type = EXCLUDED.type,
      color = EXCLUDED.color,
      away_color = EXCLUDED.away_color,
      image_version = EXCLUDED.image_version,
      name_for_url = EXCLUDED.name_for_url,
      popularity_rank = EXCLUDED.popularity_rank,
      main_competition_external_id = EXCLUDED.main_competition_external_id,
      updated_at = NOW();
  `;

  let count = 0;
  for (const t of teams) {
    await pool.query(sql, [
      t.id, // external_team_id
      t.name,
      t.shortName ?? null,
      t.symbolicName ?? null,
      t.countryId ?? null,
      t.sportId ?? 1,
      t.type ?? null,
      t.color ?? null,
      t.awayColor ?? null,
      t.imageVersion ?? null,
      t.nameForURL ?? null,
      t.popularityRank ?? null,
      t.mainCompetitionId ?? null,
    ]);
    count++;
  }

  return { insertedOrUpdated: count };
}

async function main() {
  console.log("Fetching Premier League teams from SportsAPI...");
  const teams = await fetchFixturesTeams();

  console.log(`Found ${teams.length} teams:`);
  for (const t of teams.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`- ${t.name} (external_team_id=${t.id})`);
  }

  console.log("\nUpserting into Postgres...");
  const result = await upsertTeams(teams);

  console.log(`Done. Upserted ${result.insertedOrUpdated} teams.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

