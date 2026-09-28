import pool, { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { lockWarehouse, unitsHeld } from "@/lib/inventory";
import { warehouseInputSchema } from "@/lib/validation/warehouse";

type Context = { params: Promise<{ id: string }> };

// GET /api/warehouses/1
// The warehouse and every product stocked in it.
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid warehouse id.");

    const warehouseResult = await pool.query(
      `SELECT warehouse_id, name, location, capacity, created_at
       FROM warehouse
       WHERE warehouse_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (warehouseResult.rowCount === 0) return jsonError(404, "Warehouse not found.");

    const inventoryResult = await pool.query(
      `SELECT i.inventory_id, i.warehouse_id, w.name AS warehouse,
              i.product_id, p.name AS product, p.sku, p.reorder_level,
              i.quantity, i.reserved_quantity,
              i.quantity - i.reserved_quantity AS available,
              i.last_updated
       FROM inventory i
       JOIN warehouse w ON w.warehouse_id = i.warehouse_id
       JOIN product   p ON p.product_id   = i.product_id
       WHERE i.warehouse_id = $1
       ORDER BY p.name`,
      [id],
    );

    return Response.json({ ...warehouseResult.rows[0], inventory: inventoryResult.rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/warehouses/1   (full update)
// Capacity cannot be lowered below the units already stored there.
export async function PUT(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid warehouse id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = warehouseInputSchema.parse(body);

    const updated = await withTransaction(async (client) => {
      // Lock so no stock can be received between the check and the update.
      await lockWarehouse(client, id, organizationId);
      const held = await unitsHeld(client, id);
      if (input.capacity < held) {
        throw new HttpError(
          409,
          `This warehouse already holds ${held} units, so capacity cannot be set below that.`,
        );
      }

      const { rows } = await client.query(
        `UPDATE warehouse
         SET name = $3, location = $4, capacity = $5
         WHERE warehouse_id = $1 AND organization_id = $2
         RETURNING warehouse_id, name, location, capacity, created_at`,
        [id, organizationId, input.name, input.location, input.capacity],
      );
      return rows[0];
    });

    return Response.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/warehouses/1
// The foreign keys from inventory and shipment block this while the
// warehouse still has stock rows or shipment history (409).
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid warehouse id.");

    const { rowCount } = await pool.query(
      "DELETE FROM warehouse WHERE warehouse_id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (rowCount === 0) return jsonError(404, "Warehouse not found.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
