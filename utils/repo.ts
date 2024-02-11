import { knex, Knex } from "knex";

let _repo: Knex;
export const repo = () => {
  if (_repo) return _repo;
  _repo = knex({
    client: 'pg',
    connection: {
      connectionString: process.env['DATABASE_URL'],
    },
    pool: {
      min: 0,
      max: 1,
    }
  });
  return _repo;
}
export default repo;
