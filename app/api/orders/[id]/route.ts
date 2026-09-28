import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };

// GET /api/orders/1008
// The order with its customer, lines and shipments.
//
// There is no PUT or DELETE: once placed, an order's lines are fixed and it
// is cancelled rather than deleted, so its history stays intact.
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid order id.");

    const orderResult = await pool.query(
      `SELECT o.order_id, o.customer_id, c.name AS customer_name,
              o.order_date, o.expected_date, o.status, o.total_amount
       FROM customer_order o
       JOIN customer c ON c.customer_id = o.customer_id
       WHERE o.order_id = $1 AND o.organization_id = $2`,
      [id, organizationId],
    );
    if (orderResult.rowCount === 0) return jsonError(404, "Order not found.");

    const itemsResult = await pool.query(
      `SELECT oi.order_item_id, oi.product_id, p.name AS product, p.sku,
              oi.quantity, oi.unit_price,
              oi.quantity * oi.unit_price AS line_total
       FROM order_item oi
       JOIN product p ON p.product_id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY p.name`,
      [id],
    );

    const shipmentsResult = await pool.query(
      `SELECT s.shipment_id, s.warehouse_id, w.name AS warehouse, s.status,
              s.shipment_date, s.expected_delivery, s.actual_delivery,
              t.vehicle_number
       FROM shipment s
       JOIN warehouse w      ON w.warehouse_id = s.warehouse_id
       LEFT JOIN transport t ON t.transport_id = s.transport_id
       WHERE s.order_id = $1
       ORDER BY s.shipment_id`,
      [id],
    );

    return Response.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
      shipments: shipmentsResult.rows,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
