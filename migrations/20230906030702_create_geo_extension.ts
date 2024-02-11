import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.raw(
    "CREATE EXTENSION IF NOT EXISTS \"postgis\" VERSION '3.4.1' CASCADE;",
  );
}

export async function down(knex: Knex): Promise<void> {}
