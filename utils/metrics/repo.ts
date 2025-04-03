import { knex, Knex } from "knex";

let _repo: Knex;
export const repo = () => {
  if (_repo) return _repo;
  
  // Parse the connection string to get individual components
  const connectionString = process.env["DATABASE_URL"] || "";
  const matches = connectionString.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (!matches) {
    console.error("Invalid DATABASE_URL format");
    throw new Error("Invalid DATABASE_URL format");
  }
  
  const [, user, password, host, port, database] = matches;
  
  _repo = knex({
    client: "mysql2",
    connection: {
      host,
      port: parseInt(port, 10),
      user,
      password,
      database,
    },
    pool: {
      min: 0,
      max: 1,
    },
  });
  return _repo;
};
export default repo;
