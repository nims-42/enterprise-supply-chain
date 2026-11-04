import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { escapeLike, handleRouteError, jsonError, readJson } from "@/lib/api";
import { customerInputSchema, customerListQuerySchema } from "@/lib/validation/customer";

// GET /api/customers?q=retail&limit=20&offset=0
// Customers of this organization with a summary of their orders.
// "Spent" counts completed orders only; open orders are shown separately.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = customerListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const search = query.q ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT c.customer_id, c.name, c.email, c.phone, c.address, c.created_at,
              COUNT(o.order_id)                                         AS order_count,
              COUNT(o.order_id) FILTER (
                  WHERE o.status IN ('PENDING', 'CONFIRMED', 'PROCESSING')
              )                                                         AS open_orders,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'COMPLETED'), 0)
                                                                        AS total_spent,
              MAX(o.order_date)                                         AS last_order_date,
              COUNT(*) OVER ()                                          AS total_count
       FROM customer c
       LEFT JOIN customer_order o ON o.customer_id = c.customer_id
       WHERE c.organization_id = $1
         AND ($2::text IS NULL OR c.name ILIKE $2 OR c.email ILIKE $2 OR c.phone ILIKE $2)
       GROUP BY c.customer_id
       ORDER BY c.name
       LIMIT $3 OFFSET $4`,
      [organizationId, search, query.limit, query.offset],
    );

    const total = rows.length > 0 ? rows[0].total_count : 0;
    for (const row of rows) delete row.total_count;

    return Response.json({ data: rows, total, limit: query.limit, offset: query.offset });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/customers
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = customerInputSchema.parse(body);

    const { rows } = await pool.query(
      `INSERT INTO customer (organization_id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING customer_id, name, email, phone, address, created_at`,
      [organizationId, input.name, input.email, input.phone, input.address],
    );

    const customer = rows[0];
    return Response.json(customer, {
      status: 201,
      headers: { Location: `/api/customers/${customer.customer_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
