import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("teams", (t) => {
    t.text("logo_url").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("teams", (t) => {
    t.dropColumn("logo_url");
  });
}
