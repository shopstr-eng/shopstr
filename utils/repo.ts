import { knex, Knex } from "knex";

// types.setTypeParser(types.builtins.TIMESTAMPTZ, val => DateTime.fromSQL(val).toUTC().toISO())

let _repo: Knex;
export const repo = () => {
  if (_repo) return _repo;
  _repo = knex({
    client: 'pg',
    connection: {
      connectionString: process.env['DATABASE_URL'],
      ssl: { rejectUnauthorized: false, },
    },
    pool: {
      min: 2,
      max: 10
    },
  });
  return _repo;
}
export default repo;