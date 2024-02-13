import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable("transactions", (table) => {
    table.string("id");
    table.dateTime("date_time");
    table.bigInteger("total");
    table.bigInteger("sub_total");
    table.bigInteger("tip_total");
    table.bigInteger("shipping_total");
    table.bigInteger("discount_total");
    table.bigInteger("fee_total");
    table.bigInteger("tax_total");
    table.string("currency");
    table.string("customer_id");
    table.string("merchant_id");
    table.string("listing_id");
    table.geometry("customer_location");
    table.geometry("merchant_location");
    table.primary(["id", "date_time"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("transactions");
}
