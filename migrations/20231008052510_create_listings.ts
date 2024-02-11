import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("listings", (table) => {
    table.string("id");
    table.string("listing_id");
    table.dateTime("date_time");
    table.string("merchant_id");
    table.geometry("merchant_location");
    table.specificType("relays", "text ARRAY");
    table.primary(["id", "date_time"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("listings");
}
