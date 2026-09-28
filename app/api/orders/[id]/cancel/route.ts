import { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, parseId } from "@/lib/api";
import { releaseOrderStock } from "@/lib/orders";

type Context = { params: Promise<{ id: string }> };

// POST /api/orders/1011/cancel
// PENDING or CONFIRMED -> CANCELLED. For a confirmed order the reserved
// stock goes back to "available" and its shipment is cancelled, in the same
// transaction. Orders whose goods have already left can't be cancelled.
export async function POST(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid order id.");

    await withTransaction(async (client) => {
      const order = await client.query(
        `SELECT status FROM customer_order
         WHERE order_id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, organizationId],
      );
      if (order.rowCount === 0) throw new HttpError(404, "Order not found.");

      const status: string = order.rows[0].status;
      if (!["PENDING", "CONFIRMED"].includes(status)) {
        throw new HttpError(409, `A ${status.toLowerCase()} order cannot be cancelled.`);
      }

      await releaseOrderStock(client, id, organizationId);
      await client.query("UPDATE customer_order SET status = 'CANCELLED' WHERE order_id = $1", [
        id,
      ]);
    });

    return Response.json({ order_id: id, status: "CANCELLED" });
  } catch (err) {
    return handleRouteError(err);
  }
}
