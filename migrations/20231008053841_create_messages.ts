import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('messages', (table) => {

    table.bigIncrements('id');
    table.dateTime('time');
    table.string('sender_id');
    table.string('recipient_id');
    table.specificType('relays', 'text ARRAY');
    table.geometry('location');

    table.primary(['id', 'time']);
  });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('messages');
}
