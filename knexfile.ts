import type { Knex } from "knex";
import "dotenv/config";

// Parse the connection string to get individual components
const connectionString = process.env["DATABASE_URL"] || "";
const matches = connectionString.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

if (!matches) {
  console.error("Invalid DATABASE_URL format");
  throw new Error("Invalid DATABASE_URL format");
}

const [, user, password, host, port, database] = matches;

// Update with your config settings.
const config: { [key: string]: Knex.Config } = {
  development: {
    client: "mysql2",
    connection: {
      host,
      port: parseInt(port, 10),
      user,
      password,
      database,
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
    client: "mysql2",
    connection: {
      host,
      port: parseInt(port, 10),
      user,
      password,
      database,
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
