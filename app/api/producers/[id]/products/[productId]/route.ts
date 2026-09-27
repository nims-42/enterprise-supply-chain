import pool from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { supplyTermsSchema } from "@/lib/validation/producer";

type Context = { params: Promise<{ id: string; productId: string }> };

// Both handlers join to producer so the organization check happens in the
// same statement as the change.

// PUT /api/producers/1/products/101   (ADMIN only)
// Body: { supply_price, lead_time_days, minimum_order_quantity }
export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can change supply terms.");
    }
    const { id, productId } = await params;
    const producerId = parseId(id);
    const prodId = parseId(productId);
    if (producerId === null || prodId === null) return jsonError(400, "Invalid id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = supplyTermsSchema.parse(body);

    const { rows, rowCount } = await pool.query(
      `UPDATE producer_product pp
       SET supply_price = $3, lead_time_days = $4, minimum_order_quantity = $5
       FROM producer pr
       WHERE pr.producer_id = pp.producer_id
         AND pr.organization_id = $6
         AND pp.producer_id = $1
         AND pp.product_id = $2
       RETURNING pp.producer_id, pp.product_id, pp.supply_price,
                 pp.lead_time_days, pp.minimum_order_quantity`,
      [
        producerId,
        prodId,
        input.supply_price,
        input.lead_time_days,
        input.minimum_order_quantity,
        user.organizationId,
      ],
    );
    if (rowCount === 0) return jsonError(404, "This producer does not supply that product.");

    return Response.json(rows[0]);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/producers/1/products/101   (ADMIN only)
// Removes the link only; the producer and the product both stay.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can change supply terms.");
    }
    const { id, productId } = await params;
    const producerId = parseId(id);
    const prodId = parseId(productId);
    if (producerId === null || prodId === null) return jsonError(400, "Invalid id.");

    const { rowCount } = await pool.query(
      `DELETE FROM producer_product pp
       USING producer pr
       WHERE pr.producer_id = pp.producer_id
         AND pr.organization_id = $3
         AND pp.producer_id = $1
         AND pp.product_id = $2`,
      [producerId, prodId, user.organizationId],
    );
    if (rowCount === 0) return jsonError(404, "This producer does not supply that product.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
