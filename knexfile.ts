/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
export const development = {
  client: 'pg',
  connection: {
    connectionString: process.env['DATABASE_URL'],
    ssl: { rejectUnauthorized: false, },
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
export const production = {
  client: 'pg',
  connection: {
    connectionString: process.env['DATABASE_URL'],
    ssl: { rejectUnauthorized: false, },
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
