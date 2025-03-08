import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.raw(
    "CREATE EXTENSION IF NOT EXISTS \"postgis\" CASCADE;",
  );
}

export async function down(knex: Knex): Promise<void> {}
