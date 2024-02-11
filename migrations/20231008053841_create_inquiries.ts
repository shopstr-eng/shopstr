import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("inquiries", (table) => {
    table.string("id");
    table.dateTime("date_time");
    table.string("customer_id");
    table.string("merchant_id");
    table.geometry("customer_location");
    table.string("listing_id");
    table.specificType("relays", "text ARRAY");
    table.primary(["id", "date_time"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("inquiries");
}
