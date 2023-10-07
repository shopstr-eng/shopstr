import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('customers', (table) => {

    table.uuid('id');
    table.dateTime('time');
    table.text('notes');
    table.string('customer_id');
    table.string('merchant_id');

    table.primary(['id', 'time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('customers');
}
