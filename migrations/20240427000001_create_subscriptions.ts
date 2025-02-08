
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("subscriptions", (table) => {
    table.string("id").primary();
    table.string("npub").notNullable();
    table.string("name").notNullable();
    table.dateTime("start_date").notNullable();
    table.dateTime("last_payment_date").notNullable();
    table.dateTime("next_payment_date").notNullable();
    table.boolean("active").defaultTo(true);
    table.integer("amount").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("subscriptions");
}
