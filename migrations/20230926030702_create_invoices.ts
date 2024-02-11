import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('invoices', (table) => {
    table.string('id');
    table.dateTime('date_time');
    table.bigInteger('total'); // 1234
    table.bigInteger('sub_total');
    table.bigInteger('tip_total');
    table.bigInteger('shipping_total');
    table.bigInteger('discount_total');
    table.bigInteger('fee_total');
    table.bigInteger('tax_total');
    table.string('currency'); // "SAT", "USD"
    table.string('hash'); // mint hash
    table.primary(['id', 'date_time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('invoices');
}
