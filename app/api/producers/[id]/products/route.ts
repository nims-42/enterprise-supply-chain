import pool from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { addSupplySchema } from "@/lib/validation/producer";

type Context = { params: Promise<{ id: string }> };

// POST /api/producers/1/products   (ADMIN only)
// Body: { product_id, supply_price, lead_time_days, minimum_order_quantity }
// Adds a row to producer_product: "this producer supplies this product".
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can change supply terms.");
    }
    const producerId = parseId((await params).id);
    if (producerId === null) return jsonError(400, "Invalid producer id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = addSupplySchema.parse(body);

    // producer_product has no organization_id column, so a plain INSERT
    // could link our producer to another organization's product. Selecting
    // both rows under the same organization_id makes that impossible: if
    // either belongs elsewhere, nothing is inserted.
    const { rows, rowCount } = await pool.query(
      `INSERT INTO producer_product
           (producer_id, product_id, supply_price, lead_time_days, minimum_order_quantity)
       SELECT pr.producer_id, p.product_id, $3, $4, $5
       FROM producer pr
       JOIN product p ON p.organization_id = pr.organization_id
       WHERE pr.producer_id = $1
         AND p.product_id = $2
         AND pr.organization_id = $6
       RETURNING producer_id, product_id, supply_price, lead_time_days, minimum_order_quantity`,
      [
        producerId,
        input.product_id,
        input.supply_price,
        input.lead_time_days,
        input.minimum_order_quantity,
        user.organizationId,
      ],
    );
    if (rowCount === 0) return jsonError(404, "Producer or product not found.");

    return Response.json(rows[0], { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
