import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('products', (table) => {

    table.bigIncrements('id');
    table.dateTime('time');
    table.bigInteger('price');
    table.text('notes');
    table.string('merchant_id')
    table.specificType('relays', 'text ARRAY');
    table.geometry('location');
    table.string('category');

    table.primary(['id', 'time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('products');
}
