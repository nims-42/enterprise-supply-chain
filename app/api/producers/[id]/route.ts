import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { producerInputSchema } from "@/lib/validation/producer";

type Context = { params: Promise<{ id: string }> };

// GET /api/producers/1
// The producer plus every product it supplies, with the supply terms and
// the margin against our selling price.
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid producer id.");

    const producerResult = await pool.query(
      `SELECT producer_id, name, email, phone, address, status, created_at
       FROM producer
       WHERE producer_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (producerResult.rowCount === 0) return jsonError(404, "Producer not found.");

    const productsResult = await pool.query(
      `SELECT p.product_id, p.name, p.sku, p.category, p.unit_price,
              pp.supply_price, pp.lead_time_days, pp.minimum_order_quantity,
              p.unit_price - pp.supply_price AS margin
       FROM producer_product pp
       JOIN product p ON p.product_id = pp.product_id
       WHERE pp.producer_id = $1
       ORDER BY p.name`,
      [id],
    );

    return Response.json({ ...producerResult.rows[0], products: productsResult.rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/producers/1   (full update)
export async function PUT(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid producer id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = producerInputSchema.parse(body);

    const { rows, rowCount } = await pool.query(
      `UPDATE producer
       SET name = $3, email = $4, phone = $5, address = $6, status = $7
       WHERE producer_id = $1 AND organization_id = $2
       RETURNING producer_id, name, email, phone, address, status, created_at`,
      [id, organizationId, input.name, input.email, input.phone, input.address, input.status],
    );
    if (rowCount === 0) return jsonError(404, "Producer not found.");

    return Response.json(rows[0]);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/producers/1
// Its producer_product rows go too (ON DELETE CASCADE in schema.sql).
// Usually setting the status to INACTIVE is the better choice, because it
// keeps the supply history.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid producer id.");

    const { rowCount } = await pool.query(
      "DELETE FROM producer WHERE producer_id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (rowCount === 0) return jsonError(404, "Producer not found.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
