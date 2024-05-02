import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.table('transactions', table => {
    table.string('funding_source');
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.table('transactions', table => {
    table.dropColumn('funding_source');
  })
}
