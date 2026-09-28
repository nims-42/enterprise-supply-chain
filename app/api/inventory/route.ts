import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { escapeLike, handleRouteError } from "@/lib/api";
import { inventoryListQuerySchema } from "@/lib/validation/inventory";

// GET /api/inventory?warehouse_id=1&q=dell&low_stock=true&limit=50&offset=0
// Stock rows across this organization's warehouses.
// low_stock=true keeps rows where available <= the product's reorder level.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = inventoryListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const search = query.q ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT i.inventory_id, i.warehouse_id, w.name AS warehouse,
              i.product_id, p.name AS product, p.sku, p.reorder_level,
              i.quantity, i.reserved_quantity,
              i.quantity - i.reserved_quantity AS available,
              i.last_updated,
              COUNT(*) OVER () AS total_count
       FROM inventory i
       JOIN warehouse w ON w.warehouse_id = i.warehouse_id
       JOIN product   p ON p.product_id   = i.product_id
       WHERE w.organization_id = $1
         AND ($2::bigint IS NULL OR i.warehouse_id = $2)
         AND ($3::text   IS NULL OR p.name ILIKE $3 OR p.sku ILIKE $3)
         AND (NOT $4::boolean OR i.quantity - i.reserved_quantity <= p.reorder_level)
       ORDER BY w.name, p.name
       LIMIT $5 OFFSET $6`,
      [
        organizationId,
        query.warehouse_id ?? null,
        search,
        query.low_stock,
        query.limit,
        query.offset,
      ],
    );

    const total = rows.length > 0 ? rows[0].total_count : 0;
    for (const row of rows) delete row.total_count;

    return Response.json({ data: rows, total, limit: query.limit, offset: query.offset });
  } catch (err) {
    return handleRouteError(err);
  }
}
