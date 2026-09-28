import { Pool, types, type PoolClient } from "pg";

// By default pg returns BIGINT and NUMERIC columns as strings, because they
// can hold values larger than a JavaScript number can represent exactly.
// Our IDs are nowhere near 2^53 and our money columns are NUMERIC(12,2) /
// NUMERIC(14,2), so converting both to numbers is safe and makes the JSON
// easier to use in the UI.
types.setTypeParser(20, (value) => Number(value)); // BIGINT (int8)
types.setTypeParser(1700, (value) => Number(value)); // NUMERIC

// DATE columns (e.g. customer_order.expected_date) have no time or timezone.
// pg would turn them into a JS Date at local midnight, which in IST is the
// previous day 18:30 UTC and can display as the wrong date. Keep them as the
// plain "YYYY-MM-DD" text PostgreSQL sends.
types.setTypeParser(1082, (value) => value); // DATE

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

/**
 * Runs `work` inside one database transaction:
 *
 *   BEGIN -> work(client) -> COMMIT
 *                         -> ROLLBACK if anything throws
 *
 * Every query in `work` must use the `client` it is given (not `pool`), so
 * they all run on the same connection and inside the same transaction.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
