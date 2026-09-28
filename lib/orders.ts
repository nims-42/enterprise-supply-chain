import type { PoolClient } from "pg";
import { HttpError } from "@/lib/api";
import { lockWarehouse, lockWarehouses } from "@/lib/inventory";

// Reserving and releasing stock for an order. Both run inside the caller's
// transaction (they take its client), so they either fully happen or not
// at all.
//
// How reservations work in this schema: an order's stock is reserved in the
// warehouse its OUTBOUND shipment will leave from. While that shipment is
// CREATED or PACKED the units count in inventory.reserved_quantity. This is
// the same rule seed.sql uses to fill reserved_quantity.
//
// Lock order everywhere: order row -> warehouse row(s) -> inventory rows.
// Always taking locks in the same order is what prevents deadlocks.
//
// Two things are deliberately NOT done here because the database does them
// (advanced.sql): order totals (trigger on order_item) and
// inventory.last_updated (trigger on inventory).

interface Shortage {
  product: string;
  needed: number;
  available: number;
}

/**
 * Reserves every line of the order in one warehouse, creates the OUTBOUND
 * shipment (status CREATED) and marks the order CONFIRMED.
 * Throws 409 listing every product that is short; nothing is changed then.
 */
export async function reserveOrderStock(
  client: PoolClient,
  orderId: number,
  warehouseId: number,
  organizationId: number,
): Promise<{ shipment_id: number }> {
  const warehouse = await lockWarehouse(client, warehouseId, organizationId);

  const items = await client.query(
    `SELECT oi.product_id, oi.quantity, p.name
     FROM order_item oi
     JOIN product p ON p.product_id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.product_id`,
    [orderId],
  );

  // Lock each inventory row and check it before changing anything, so the
  // error can list every shortage, not just the first one.
  const shortages: Shortage[] = [];
  for (const item of items.rows) {
    const stock = await client.query(
      `SELECT quantity - reserved_quantity AS available
       FROM inventory
       WHERE warehouse_id = $1 AND product_id = $2
       FOR UPDATE`,
      [warehouseId, item.product_id],
    );
    const available = stock.rows.length === 0 ? 0 : stock.rows[0].available;
    if (available < item.quantity) {
      shortages.push({ product: item.name, needed: item.quantity, available });
    }
  }
  if (shortages.length > 0) {
    throw new HttpError(
      409,
      `${warehouse.name} does not have enough unreserved stock: ` +
        shortages
          .map((s) => `${s.product} (need ${s.needed}, ${s.available} available)`)
          .join("; ") +
        ".",
    );
  }

  // One UPDATE ... FROM reserves every line at once.
  await client.query(
    `UPDATE inventory i
     SET reserved_quantity = i.reserved_quantity + oi.quantity
     FROM order_item oi
     WHERE oi.order_id     = $2
       AND i.warehouse_id  = $1
       AND i.product_id    = oi.product_id`,
    [warehouseId, orderId],
  );

  const shipment = await client.query(
    `INSERT INTO shipment (shipment_type, warehouse_id, order_id, expected_delivery, status)
     SELECT 'OUTBOUND', $1, o.order_id, o.expected_date, 'CREATED'
     FROM customer_order o
     WHERE o.order_id = $2
     RETURNING shipment_id`,
    [warehouseId, orderId],
  );

  await client.query("UPDATE customer_order SET status = 'CONFIRMED' WHERE order_id = $1", [
    orderId,
  ]);

  return shipment.rows[0];
}

/**
 * Undoes reserveOrderStock: gives the reserved units back and cancels the
 * order's shipments that are still in a warehouse (CREATED or PACKED).
 * Refuses (409) if any shipment has already left the warehouse.
 */
export async function releaseOrderStock(
  client: PoolClient,
  orderId: number,
  organizationId: number,
): Promise<void> {
  const shipments = await client.query(
    `SELECT shipment_id, warehouse_id, status
     FROM shipment
     WHERE order_id = $1
       AND shipment_type = 'OUTBOUND'
       AND status <> 'CANCELLED'
     FOR UPDATE`,
    [orderId],
  );

  const gone = shipments.rows.filter((s) => !["CREATED", "PACKED"].includes(s.status));
  if (gone.length > 0) {
    throw new HttpError(
      409,
      `Shipment #${gone[0].shipment_id} has already left the warehouse (${gone[0].status}), ` +
        "so this order can no longer be cancelled.",
    );
  }

  const warehouseIds = shipments.rows.map((s) => s.warehouse_id);
  await lockWarehouses(client, warehouseIds, organizationId);

  for (const s of shipments.rows) {
    await client.query(
      `UPDATE inventory i
       SET reserved_quantity = i.reserved_quantity - oi.quantity
       FROM order_item oi
       WHERE oi.order_id    = $2
         AND i.warehouse_id = $1
         AND i.product_id   = oi.product_id`,
      [s.warehouse_id, orderId],
    );
    await client.query("UPDATE shipment SET status = 'CANCELLED' WHERE shipment_id = $1", [
      s.shipment_id,
    ]);
  }
}
