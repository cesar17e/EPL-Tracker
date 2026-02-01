// migrations/202602010001_init_schema.ts
import type { Knex } from "knex";

/**
 * Baseline schema migration (Postgres / Neon).
 *
 * This recreates the application tables:
 * - users
 * - competitions
 * - teams
 * - matches
 * - refresh_tokens
 * - email_verification_tokens
 * - user_favorite_teams
 *
 */
export async function up(knex: Knex): Promise<void> {
  // --- users ---
  await knex.schema.createTable("users", (t) => {
    t.bigIncrements("id").primary();

    t.text("email").notNullable().unique();
    t.text("password_hash").notNullable();

    t.boolean("email_verified").notNullable().defaultTo(false);
    t.boolean("email_opt_in").notNullable().defaultTo(false);

    t.text("time_zone").notNullable().defaultTo("America/New_York");
    t.boolean("is_admin").notNullable().defaultTo(false);

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Helpful index (you already also have a unique index on email; keeping this matches your schema list)
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_users_email ON public.users USING btree (email)`);

  // --- competitions ---
  await knex.schema.createTable("competitions", (t) => {
    t.bigIncrements("id").primary();

    t.bigInteger("external_competition_id").notNullable().unique();
    t.text("name").notNullable();

    t.bigInteger("country_id").nullable();
    t.bigInteger("sport_id").nullable().defaultTo(1);

    t.text("name_for_url").nullable();
    t.integer("image_version").nullable();

    t.integer("current_season_num").nullable();
    t.integer("current_stage_num").nullable();

    t.boolean("is_active").nullable().defaultTo(true);

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- teams ---
  await knex.schema.createTable("teams", (t) => {
    t.bigIncrements("id").primary();

    t.bigInteger("external_team_id").notNullable().unique();
    t.text("name").notNullable();

    t.text("short_name").nullable();
    t.text("symbolic_name").nullable();

    t.bigInteger("country_id").nullable();
    t.bigInteger("sport_id").nullable().defaultTo(1);

    // Postgres smallint
    t.specificType("type", "smallint").nullable();

    t.text("color").nullable();
    t.text("away_color").nullable();

    t.text("name_for_url").nullable();
    t.bigInteger("popularity_rank").nullable();

    t.bigInteger("main_competition_external_id").nullable();

    t.integer("image_version").nullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_teams_name ON public.teams USING btree (name)`);

  // --- matches ---
  await knex.schema.createTable("matches", (t) => {
    t.bigIncrements("id").primary();

    t.bigInteger("external_game_id").notNullable().unique();
    t.bigInteger("external_competition_id").notNullable();

    t.integer("season_num").nullable();
    t.integer("stage_num").nullable();
    t.integer("group_num").nullable();

    t.text("round_name").nullable();
    t.text("group_name").nullable();

    t.timestamp("start_time", { useTz: true }).notNullable();

    t.specificType("status_group", "smallint").notNullable();
    t.text("status_text").nullable();
    t.text("short_status_text").nullable();

    t.bigInteger("home_team_external_id").notNullable();
    t.bigInteger("away_team_external_id").notNullable();

    // numeric without fixed precision/scale
    t.specificType("home_score", "numeric").nullable();
    t.specificType("away_score", "numeric").nullable();

    t.specificType("winner", "smallint").nullable();

    t.boolean("has_lineups").nullable();
    t.boolean("has_stats").nullable();
    t.boolean("has_news").nullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_matches_away_team ON public.matches USING btree (away_team_external_id)`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_matches_competition ON public.matches USING btree (external_competition_id)`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_matches_home_team ON public.matches USING btree (home_team_external_id)`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_matches_start_time ON public.matches USING btree (start_time)`);

  // --- refresh_tokens ---
  await knex.schema.createTable("refresh_tokens", (t) => {
    t.bigIncrements("id").primary();

    t.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.text("token_hash").notNullable();

    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("revoked_at", { useTz: true }).nullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash)`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id)`);

  // --- email_verification_tokens ---
  await knex.schema.createTable("email_verification_tokens", (t) => {
    t.bigIncrements("id").primary();

    t.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");

    t.text("token_hash").notNullable().unique();

    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("used_at", { useTz: true }).nullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON public.email_verification_tokens USING btree (expires_at)`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON public.email_verification_tokens USING btree (user_id)`);

  // --- user_favorite_teams ---
  await knex.schema.createTable("user_favorite_teams", (t) => {
    t.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.bigInteger("team_id").notNullable().references("id").inTable("teams").onDelete("CASCADE");

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Composite PK = unique (user_id, team_id)
    t.primary(["user_id", "team_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists("user_favorite_teams");
  await knex.schema.dropTableIfExists("email_verification_tokens");
  await knex.schema.dropTableIfExists("refresh_tokens");
  await knex.schema.dropTableIfExists("matches");
  await knex.schema.dropTableIfExists("teams");
  await knex.schema.dropTableIfExists("competitions");
  await knex.schema.dropTableIfExists("users");
}
