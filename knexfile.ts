import type { Knex } from "knex";
import "dotenv/config";

// Update with your config settings.

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: {
      connectionString: process.env["DATABASE_URL"],
    },
    migrations: {
      tableName: "knex_migrations",
    },
    pool: {
      min: 0,
      max: 1,
    },
  },
  production: {
    client: "pg",
    connection: {
      connectionString: process.env["DATABASE_URL"],
    },
    migrations: {
      tableName: "knex_migrations",
    },
    pool: {
      min: 0,
      max: 1,
    },
  },
};

export default config;
