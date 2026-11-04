import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { warehouseInputSchema } from "@/lib/validation/warehouse";

// GET /api/warehouses
// Every warehouse of this organization with a stock summary, aggregated
// from the inventory_status view (advanced.sql). LEFT JOIN so a warehouse
// with no stock yet still appears (with zeros).
export async function GET() {
  try {
    const organizationId = await getCurrentOrganizationId();
    const { rows } = await pool.query(
      `SELECT w.warehouse_id, w.name, w.location, w.capacity, w.created_at,
              COUNT(v.inventory_id)                                  AS product_count,
              COALESCE(SUM(v.quantity), 0)                           AS units_held,
              COALESCE(SUM(v.reserved_quantity), 0)                  AS units_reserved,
              COUNT(*) FILTER (WHERE v.stock_status <> 'IN_STOCK')   AS low_stock_count
       FROM warehouse w
       LEFT JOIN inventory_status v ON v.warehouse_id = w.warehouse_id
       WHERE w.organization_id = $1
       GROUP BY w.warehouse_id
       ORDER BY w.name`,
      [organizationId],
    );
    return Response.json(rows);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/warehouses
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = warehouseInputSchema.parse(body);

    const { rows } = await pool.query(
      `INSERT INTO warehouse (organization_id, name, location, capacity)
       VALUES ($1, $2, $3, $4)
       RETURNING warehouse_id, name, location, capacity, created_at`,
      [organizationId, input.name, input.location, input.capacity],
    );

    const warehouse = rows[0];
    return Response.json(warehouse, {
      status: 201,
      headers: { Location: `/api/warehouses/${warehouse.warehouse_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
