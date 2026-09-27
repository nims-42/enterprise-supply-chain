import { Pool } from "pg";

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
