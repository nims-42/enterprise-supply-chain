import pool, { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { assertCapacity, lockWarehouse } from "@/lib/inventory";
import { adjustStockSchema } from "@/lib/validation/inventory";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/inventory/42
// Body: { quantity }
// Stocktake correction: set the quantity to what was physically counted.
// It can't go below reserved_quantity; the CHECK constraint
// ck_inventory_reserved_le_qty in schema.sql rejects that.
export async function PATCH(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid inventory id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = adjustStockSchema.parse(body);

    const row = await withTransaction(async (client) => {
      // Which warehouse is this row in (and is it ours)?
      const owner = await client.query(
        `SELECT i.warehouse_id
         FROM inventory i
         JOIN warehouse w ON w.warehouse_id = i.warehouse_id
         WHERE i.inventory_id = $1 AND w.organization_id = $2`,
        [id, organizationId],
      );
      if (owner.rows.length === 0) throw new HttpError(404, "Inventory record not found.");

      // Warehouse first, then the row: the same lock order as receive and
      // transfer, so these operations can never deadlock each other.
      const warehouse = await lockWarehouse(client, owner.rows[0].warehouse_id, organizationId);
      const current = await client.query(
        "SELECT quantity FROM inventory WHERE inventory_id = $1 FOR UPDATE",
        [id],
      );
      await assertCapacity(client, warehouse, input.quantity - current.rows[0].quantity);

      const { rows } = await client.query(
        `UPDATE inventory
         SET quantity = $2, last_updated = now()
         WHERE inventory_id = $1
         RETURNING inventory_id, warehouse_id, product_id, quantity, reserved_quantity,
                   quantity - reserved_quantity AS available, last_updated`,
        [id, input.quantity],
      );
      return rows[0];
    });

    return Response.json(row);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/inventory/42
// Removes an empty stock row ("we no longer keep this product here").
// Rows that still hold or reserve stock are refused.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid inventory id.");

    const { rowCount } = await pool.query(
      `DELETE FROM inventory i
       USING warehouse w
       WHERE w.warehouse_id = i.warehouse_id
         AND w.organization_id = $2
         AND i.inventory_id = $1
         AND i.quantity = 0
         AND i.reserved_quantity = 0`,
      [id, organizationId],
    );

    if (rowCount === 0) {
      // Tell apart "doesn't exist" from "exists but isn't empty".
      const exists = await pool.query(
        `SELECT 1 FROM inventory i
         JOIN warehouse w ON w.warehouse_id = i.warehouse_id
         WHERE i.inventory_id = $1 AND w.organization_id = $2`,
        [id, organizationId],
      );
      if (exists.rowCount === 0) return jsonError(404, "Inventory record not found.");
      return jsonError(409, "Only empty stock records can be removed. Set the quantity to 0 first.");
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
