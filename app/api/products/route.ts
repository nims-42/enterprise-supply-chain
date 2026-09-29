import { after, type NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { escapeLike, handleRouteError, jsonError, readJson } from "@/lib/api";
import { productInputSchema, productListQuerySchema } from "@/lib/validation/product";
import { syncProductVectorQuietly } from "@/lib/product-vectors";

// GET /api/products?q=laptop&category=Laptops&limit=20&offset=0
// Lists this organization's products with their total and available stock
// across all warehouses.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = productListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const search = query.q ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT p.product_id, p.name, p.sku, p.description, p.category,
              p.unit_price, p.reorder_level, p.created_at,
              COALESCE(s.quantity, 0)  AS total_quantity,
              COALESCE(s.available, 0) AS total_available,
              COUNT(*) OVER ()         AS total_count
       FROM product p
       LEFT JOIN (
           SELECT product_id,
                  SUM(quantity)                     AS quantity,
                  SUM(quantity - reserved_quantity) AS available
           FROM inventory
           GROUP BY product_id
       ) s ON s.product_id = p.product_id
       WHERE p.organization_id = $1
         AND ($2::text IS NULL OR p.name ILIKE $2 OR p.sku ILIKE $2)
         AND ($3::text IS NULL OR p.category = $3)
       ORDER BY p.name
       LIMIT $4 OFFSET $5`,
      [organizationId, search, query.category ?? null, query.limit, query.offset],
    );

    // COUNT(*) OVER () repeats the full match count on every row; lift it out
    // once so the client gets it alongside the page of results.
    const total = rows.length > 0 ? rows[0].total_count : 0;
    for (const row of rows) delete row.total_count;

    return Response.json({ data: rows, total, limit: query.limit, offset: query.offset });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/products
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = productInputSchema.parse(body);

    const { rows } = await pool.query(
      `INSERT INTO product
           (organization_id, name, sku, description, category, unit_price, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING product_id, name, sku, description, category,
                 unit_price, reorder_level, created_at`,
      [
        organizationId,
        input.name,
        input.sku,
        input.description,
        input.category,
        input.unit_price,
        input.reorder_level,
      ],
    );

    const product = rows[0];

    // Add the new product to Qdrant once the response has been sent, so
    // embedding it never slows down or fails the save.
    after(() => syncProductVectorQuietly(organizationId, product.product_id, "index"));

    return Response.json(product, {
      status: 201,
      headers: { Location: `/api/products/${product.product_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
