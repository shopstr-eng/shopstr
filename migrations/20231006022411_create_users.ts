import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('users', (table) => {

    table.bigIncrements('id');
    table.dateTime('time');
    table.text('notes');
    table.string('user_id');
    table.geometry('location');

    table.primary(['id', 'time']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('users');
}

// crete a row metrics with time and pubkey

// SELECt disinct(pubkey) from time where o