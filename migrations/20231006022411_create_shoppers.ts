import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('shoppers', (table) => {
    table.string('id');
    table.string('shopper_id');
    table.dateTime('date_time');
    table.geometry('shopper_location');
    table.primary(['id', 'date_time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('shoppers');
}
