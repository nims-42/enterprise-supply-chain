import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { escapeLike, handleRouteError, jsonError, readJson } from "@/lib/api";
import { producerInputSchema, producerListQuerySchema } from "@/lib/validation/producer";

// GET /api/producers?q=apex&status=ACTIVE&limit=20&offset=0
// Producers of this organization with how many products each supplies.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const query = producerListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const search = query.q ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT pr.producer_id, pr.name, pr.email, pr.phone, pr.address,
              pr.status, pr.created_at,
              COUNT(pp.product_id) AS product_count,
              COUNT(*) OVER ()     AS total_count
       FROM producer pr
       LEFT JOIN producer_product pp ON pp.producer_id = pr.producer_id
       WHERE pr.organization_id = $1
         AND ($2::text IS NULL OR pr.name ILIKE $2 OR pr.email ILIKE $2)
         AND ($3::text IS NULL OR pr.status = $3)
       GROUP BY pr.producer_id
       ORDER BY pr.name
       LIMIT $4 OFFSET $5`,
      [user.organizationId, search, query.status ?? null, query.limit, query.offset],
    );

    const total = rows.length > 0 ? rows[0].total_count : 0;
    for (const row of rows) delete row.total_count;

    return Response.json({ data: rows, total, limit: query.limit, offset: query.offset });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/producers   (ADMIN only)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can add producers.");
    }

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = producerInputSchema.parse(body);

    const { rows } = await pool.query(
      `INSERT INTO producer (organization_id, name, email, phone, address, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING producer_id, name, email, phone, address, status, created_at`,
      [user.organizationId, input.name, input.email, input.phone, input.address, input.status],
    );

    const producer = rows[0];
    return Response.json(producer, {
      status: 201,
      headers: { Location: `/api/producers/${producer.producer_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
