import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("password_reset_tokens", (t) => {
    t.bigIncrements("id").primary();
    t.bigInteger("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.text("token_hash").notNullable().unique();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("used_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    "CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON public.password_reset_tokens USING btree (expires_at)"
  );
  await knex.schema.raw(
    "CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens USING btree (user_id)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("password_reset_tokens");
}
