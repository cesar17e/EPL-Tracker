
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      time_zone TEXT NOT NULL DEFAULT 'America/New_York',
      email_opt_in BOOLEAN NOT NULL DEFAULT true,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_email_tokens_user
      ON email_verification_tokens(user_id);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash
    

  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS email_verification_tokens;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS refresh_tokens;

  `);
}

/*

-- 1) Competitions we track (Premier League, later UCL, etc.)
CREATE TABLE IF NOT EXISTS competitions (
  id BIGSERIAL PRIMARY KEY,
  external_competition_id BIGINT NOT NULL UNIQUE,  -- e.g. Premier League = 7
  name TEXT NOT NULL,
  country_id BIGINT,
  sport_id BIGINT DEFAULT 1,
  name_for_url TEXT,
  image_version INT,
  current_season_num INT,
  current_stage_num INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Teams/competitors
CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  external_team_id BIGINT NOT NULL UNIQUE,         -- competitor.id
  name TEXT NOT NULL,
  short_name TEXT,
  symbolic_name TEXT,
  country_id BIGINT,
  sport_id BIGINT DEFAULT 1,
  type SMALLINT,                                   -- 1=club, 2=national
  color TEXT,
  away_color TEXT,
  image_version INT,
  name_for_url TEXT,
  popularity_rank BIGINT,
  main_competition_external_id BIGINT,             -- from API if present
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_name ON teams (name);

-- 3) Matches/games (fixtures + results)
CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  external_game_id BIGINT NOT NULL UNIQUE,         -- game.id
  external_competition_id BIGINT NOT NULL,         -- game.competitionId
  season_num INT,
  stage_num INT,
  group_num INT,
  round_name TEXT,
  group_name TEXT,

  start_time TIMESTAMPTZ NOT NULL,

  status_group SMALLINT NOT NULL,                  -- 1 scheduled, 2 live, 3 finished, 4 postponed, 5 cancelled
  status_text TEXT,
  short_status_text TEXT,

  home_team_external_id BIGINT NOT NULL,
  away_team_external_id BIGINT NOT NULL,

  home_score NUMERIC,                              -- API uses 0.0 sometimes
  away_score NUMERIC,
  winner SMALLINT,                                 -- 0 none, 1 home, 2 away

  has_lineups BOOLEAN,
  has_stats BOOLEAN,
  has_news BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_status_group CHECK (status_group IN (1,2,3,4,5)),
  CONSTRAINT chk_winner CHECK (winner IS NULL OR winner IN (0,1,2))
);

CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches (start_time);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches (external_competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches (home_team_external_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches (away_team_external_id);

-- Optional: speed up team schedule queries
CREATE INDEX IF NOT EXISTS idx_matches_team_time ON matches (home_team_external_id, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_team_time2 ON matches (away_team_external_id, start_time);

-- 4) User favorites (many-to-many)
CREATE TABLE IF NOT EXISTS user_favorite_teams (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

-- 5) Track sync runs (helps for UI + debugging)
CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'sportsapipro',
  external_competition_id BIGINT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',           -- running/success/error
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_comp ON sync_runs (external_competition_id, started_at DESC);



*/




