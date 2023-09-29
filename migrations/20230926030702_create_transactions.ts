import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('transactions', (table) => {

    table.uuid('id');
    table.dateTime('time');
    table.bigInteger('total');
    table.bigInteger('sub_total');
    table.bigInteger('tip_total');
    table.bigInteger('shipping_total');
    table.bigInteger('discount_total');
    table.bigInteger('fee_total');
    table.bigInteger('tax_total');
    table.string('currency');
    table.string('status');
    table.string('funding_source');
    table.text('notes');
    table.string('customer_id');
    table.string('merchant_id');

    table.primary(['id', 'time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('transactions');
}
