import pool from "@/lib/db";

// GET /api/health
// Confirms the app can reach PostgreSQL. Open it in the browser after
// `npm run dev` to check that DATABASE_URL in .env.local is right.
export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT current_database() AS database, current_setting('server_version') AS postgres_version, now() AS server_time",
    );
    return Response.json({ status: "ok", ...rows[0] });
  } catch (err) {
    // Log the real reason (wrong password, DB not running...) on the server,
    // but don't hand connection details to whoever is calling.
    console.error("Health check failed:", err);
    return Response.json(
      { status: "error", error: "Cannot connect to the database" },
      { status: 503 },
    );
  }
}
