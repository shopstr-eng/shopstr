import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    return knex.raw(`SELECT create_hypertable('transactions', 'time');`);
}

export async function down(knex: Knex): Promise<void> {
}

