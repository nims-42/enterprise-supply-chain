import { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, readJson } from "@/lib/api";
import { assertCapacity, assertProductInOrganization, lockWarehouses } from "@/lib/inventory";
import { transferStockSchema } from "@/lib/validation/inventory";

// POST /api/inventory/transfer
// Body: { product_id, from_warehouse_id, to_warehouse_id, quantity }
//
// The classic transaction example: take stock out of one warehouse and put
// it into another. Both changes happen, or neither does. Without the
// transaction a crash between the two statements would make stock vanish.
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = transferStockSchema.parse(body);

    const result = await withTransaction(async (client) => {
      const warehouses = await lockWarehouses(
        client,
        [input.from_warehouse_id, input.to_warehouse_id],
        organizationId,
      );
      const source = warehouses.get(input.from_warehouse_id)!;
      const destination = warehouses.get(input.to_warehouse_id)!;
      const product = await assertProductInOrganization(
        client,
        input.product_id,
        organizationId,
      );

      // Only unreserved stock can move: reserved units belong to open orders.
      const sourceRow = await client.query(
        `SELECT quantity, reserved_quantity
         FROM inventory
         WHERE warehouse_id = $1 AND product_id = $2
         FOR UPDATE`,
        [input.from_warehouse_id, input.product_id],
      );
      const available =
        sourceRow.rows.length === 0
          ? 0
          : sourceRow.rows[0].quantity - sourceRow.rows[0].reserved_quantity;
      if (available < input.quantity) {
        throw new HttpError(
          409,
          `${source.name} has only ${available} unreserved ${product.name} to transfer.`,
        );
      }

      await assertCapacity(client, destination, input.quantity);

      // Both rows' last_updated is stamped by the trigger in advanced.sql.
      const from = await client.query(
        `UPDATE inventory
         SET quantity = quantity - $3
         WHERE warehouse_id = $1 AND product_id = $2
         RETURNING inventory_id, warehouse_id, product_id, quantity, reserved_quantity,
                   quantity - reserved_quantity AS available, last_updated`,
        [input.from_warehouse_id, input.product_id, input.quantity],
      );

      const to = await client.query(
        `INSERT INTO inventory (warehouse_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (warehouse_id, product_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
         RETURNING inventory_id, warehouse_id, product_id, quantity, reserved_quantity,
                   quantity - reserved_quantity AS available, last_updated`,
        [input.to_warehouse_id, input.product_id, input.quantity],
      );

      return { from: from.rows[0], to: to.rows[0] };
    });

    return Response.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
