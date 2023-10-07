import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    return knex.raw(`SELECT create_hypertable('customers', 'time');`);
}

export async function down(knex: Knex): Promise<void> {
}


