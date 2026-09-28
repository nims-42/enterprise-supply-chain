import { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { assertCapacity, assertProductInOrganization, lockWarehouse } from "@/lib/inventory";
import { receiveStockSchema } from "@/lib/validation/inventory";

// POST /api/inventory/receive
// Body: { warehouse_id, product_id, quantity }
//
// Goods have arrived at a warehouse. One transaction:
//   1. lock the warehouse row (FOR UPDATE)
//   2. check the product belongs to this organization
//   3. check the new units fit within capacity
//   4. UPSERT the inventory row: create it if this product was never stocked
//      here, otherwise add to the existing quantity
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = receiveStockSchema.parse(body);

    const row = await withTransaction(async (client) => {
      const warehouse = await lockWarehouse(client, input.warehouse_id, organizationId);
      await assertProductInOrganization(client, input.product_id, organizationId);
      await assertCapacity(client, warehouse, input.quantity);

      // INSERT ... ON CONFLICT DO UPDATE is PostgreSQL's "upsert". The
      // UNIQUE (warehouse_id, product_id) constraint is what defines the
      // conflict. EXCLUDED is the row we tried to insert.
      const { rows } = await client.query(
        `INSERT INTO inventory (warehouse_id, product_id, quantity, last_updated)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (warehouse_id, product_id)
         DO UPDATE SET quantity     = inventory.quantity + EXCLUDED.quantity,
                       last_updated = now()
         RETURNING inventory_id, warehouse_id, product_id,
                   quantity, reserved_quantity,
                   quantity - reserved_quantity AS available, last_updated`,
        [input.warehouse_id, input.product_id, input.quantity],
      );
      return rows[0];
    });

    return Response.json(row);
  } catch (err) {
    return handleRouteError(err);
  }
}
