import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { escapeLike, handleRouteError } from "@/lib/api";
import { inventoryListQuerySchema } from "@/lib/validation/inventory";

// GET /api/inventory?warehouse_id=1&q=dell&low_stock=true&limit=50&offset=0
// Stock rows across this organization's warehouses, read from the
// inventory_status view (advanced.sql), which already joins warehouse and
// product and works out available_quantity and stock_status.
// low_stock=true keeps every row that is not IN_STOCK.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = inventoryListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const search = query.q ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT inventory_id, warehouse_id, warehouse,
              product_id, product, sku, reorder_level,
              quantity, reserved_quantity,
              available_quantity AS available,
              stock_status, last_updated,
              COUNT(*) OVER () AS total_count
       FROM inventory_status
       WHERE organization_id = $1
         AND ($2::bigint IS NULL OR warehouse_id = $2)
         AND ($3::text   IS NULL OR product ILIKE $3 OR sku ILIKE $3)
         AND (NOT $4::boolean OR stock_status <> 'IN_STOCK')
       ORDER BY warehouse, product
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
