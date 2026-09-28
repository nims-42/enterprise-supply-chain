import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { customerInputSchema } from "@/lib/validation/customer";

type Context = { params: Promise<{ id: string }> };

// GET /api/customers/1
// The customer and their order history (newest first).
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid customer id.");

    const customerResult = await pool.query(
      `SELECT customer_id, name, email, phone, address, created_at
       FROM customer
       WHERE customer_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (customerResult.rowCount === 0) return jsonError(404, "Customer not found.");

    const ordersResult = await pool.query(
      `SELECT o.order_id, o.order_date, o.expected_date, o.status, o.total_amount,
              COUNT(oi.order_item_id) AS item_count
       FROM customer_order o
       LEFT JOIN order_item oi ON oi.order_id = o.order_id
       WHERE o.customer_id = $1
       GROUP BY o.order_id
       ORDER BY o.order_date DESC`,
      [id],
    );

    return Response.json({ ...customerResult.rows[0], orders: ordersResult.rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/customers/1   (full update)
export async function PUT(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid customer id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = customerInputSchema.parse(body);

    const { rows, rowCount } = await pool.query(
      `UPDATE customer
       SET name = $3, email = $4, phone = $5, address = $6
       WHERE customer_id = $1 AND organization_id = $2
       RETURNING customer_id, name, email, phone, address, created_at`,
      [id, organizationId, input.name, input.email, input.phone, input.address],
    );
    if (rowCount === 0) return jsonError(404, "Customer not found.");

    return Response.json(rows[0]);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/customers/1
// Refused (409) once the customer has any orders: the foreign key from
// customer_order keeps order history pointing at a real customer.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid customer id.");

    const { rowCount } = await pool.query(
      "DELETE FROM customer WHERE customer_id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (rowCount === 0) return jsonError(404, "Customer not found.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
