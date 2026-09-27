import { Pool, types } from "pg";

// By default pg returns BIGINT and NUMERIC columns as strings, because they
// can hold values larger than a JavaScript number can represent exactly.
// Our IDs are nowhere near 2^53 and our money columns are NUMERIC(12,2) /
// NUMERIC(14,2), so converting both to numbers is safe and makes the JSON
// easier to use in the UI.
types.setTypeParser(20, (value) => Number(value)); // BIGINT (int8)
types.setTypeParser(1700, (value) => Number(value)); // NUMERIC

// Reuse one pool across hot reloads in dev. Without this, every file save
// in `next dev` creates a new Pool and you eventually hit
// "too many clients already" on Postgres.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export default pool;
