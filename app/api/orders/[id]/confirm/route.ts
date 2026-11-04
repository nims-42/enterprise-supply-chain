import { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { reserveOrderStock } from "@/lib/orders";
import { orderConfirmSchema } from "@/lib/validation/order";

type Context = { params: Promise<{ id: string }> };

// POST /api/orders/1013/confirm
// Body: { warehouse_id }
// PENDING -> CONFIRMED: reserves the order's stock in that warehouse and
// creates its outbound shipment, all in one transaction.
export async function POST(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid order id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = orderConfirmSchema.parse(body);

    const result = await withTransaction(async (client) => {
      // Lock the order row so two people can't confirm it at the same time
      // (which would reserve its stock twice).
      const order = await client.query(
        `SELECT status FROM customer_order
         WHERE order_id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, organizationId],
      );
      if (order.rowCount === 0) throw new HttpError(404, "Order not found.");
      if (order.rows[0].status !== "PENDING") {
        throw new HttpError(
          409,
          `Only pending orders can be confirmed; this one is ${order.rows[0].status}.`,
        );
      }
      return reserveOrderStock(client, id, input.warehouse_id, organizationId);
    });

    return Response.json({ order_id: id, status: "CONFIRMED", ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
