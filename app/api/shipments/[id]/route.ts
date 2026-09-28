import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId } from "@/lib/api";
import { nextStatuses } from "@/lib/shipments";

type Context = { params: Promise<{ id: string }> };

// GET /api/shipments/509
// The shipment, who it is for/from, what it carries, and which statuses it
// may move to next (so the UI only offers valid actions).
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid shipment id.");

    // From the shipment_overview view (advanced.sql).
    const found = await pool.query(
      `SELECT shipment_id, shipment_type, status,
              warehouse_id, warehouse,
              order_id, order_status, customer_id,
              producer_id, counterparty,
              transport_id, vehicle_number,
              shipment_date, expected_delivery, actual_delivery,
              is_overdue AS overdue, days_late
       FROM shipment_overview
       WHERE shipment_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (found.rowCount === 0) return jsonError(404, "Shipment not found.");
    const shipment = found.rows[0];

    // OUTBOUND carries its order's lines. INBOUND contents are not stored;
    // instead we list what this producer can deliver, for the receiving form.
    const items =
      shipment.shipment_type === "OUTBOUND"
        ? await pool.query(
            `SELECT oi.product_id, p.name AS product, p.sku, oi.quantity
             FROM order_item oi
             JOIN product p ON p.product_id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY p.name`,
            [shipment.order_id],
          )
        : { rows: [] };

    const receivable =
      shipment.shipment_type === "INBOUND"
        ? await pool.query(
            `SELECT p.product_id, p.name AS product, p.sku, pp.minimum_order_quantity
             FROM producer_product pp
             JOIN product p ON p.product_id = pp.product_id
             WHERE pp.producer_id = $1
             ORDER BY p.name`,
            [shipment.producer_id],
          )
        : { rows: [] };

    return Response.json({
      ...shipment,
      items: items.rows,
      receivable_products: receivable.rows,
      next_statuses: nextStatuses(shipment.shipment_type, shipment.status),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
