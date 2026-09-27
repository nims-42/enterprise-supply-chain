import pool from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { productInputSchema } from "@/lib/validation/product";

type Context = { params: Promise<{ id: string }> };

// Every query below filters on organization_id as well as product_id.
// Asking for another organization's product gives the same 404 as asking
// for one that doesn't exist, so the API never reveals what other
// organizations have.

// GET /api/products/101
// The product plus its stock in each warehouse and its suppliers.
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid product id.");

    const productResult = await pool.query(
      `SELECT product_id, name, sku, description, category,
              unit_price, reorder_level, created_at
       FROM product
       WHERE product_id = $1 AND organization_id = $2`,
      [id, user.organizationId],
    );
    if (productResult.rowCount === 0) return jsonError(404, "Product not found.");

    const inventoryResult = await pool.query(
      `SELECT w.warehouse_id, w.name AS warehouse,
              i.quantity, i.reserved_quantity,
              i.quantity - i.reserved_quantity AS available,
              i.last_updated
       FROM inventory i
       JOIN warehouse w ON w.warehouse_id = i.warehouse_id
       WHERE i.product_id = $1
       ORDER BY w.name`,
      [id],
    );

    // The other side of the producer_product M:N: who supplies this product.
    // Active suppliers first, cheapest first.
    const suppliersResult = await pool.query(
      `SELECT pr.producer_id, pr.name, pr.status,
              pp.supply_price, pp.lead_time_days, pp.minimum_order_quantity
       FROM producer_product pp
       JOIN producer pr ON pr.producer_id = pp.producer_id
       WHERE pp.product_id = $1
       ORDER BY (pr.status = 'ACTIVE') DESC, pp.supply_price, pp.lead_time_days`,
      [id],
    );

    return Response.json({
      ...productResult.rows[0],
      inventory: inventoryResult.rows,
      suppliers: suppliersResult.rows,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/products/101   (ADMIN only)
// Full update: send every field, same shape as POST.
export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can edit products.");
    }
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid product id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = productInputSchema.parse(body);

    const { rows, rowCount } = await pool.query(
      `UPDATE product
       SET name = $3, sku = $4, description = $5, category = $6,
           unit_price = $7, reorder_level = $8
       WHERE product_id = $1 AND organization_id = $2
       RETURNING product_id, name, sku, description, category,
                 unit_price, reorder_level, created_at`,
      [
        id,
        user.organizationId,
        input.name,
        input.sku,
        input.description,
        input.category,
        input.unit_price,
        input.reorder_level,
      ],
    );
    if (rowCount === 0) return jsonError(404, "Product not found.");

    return Response.json(rows[0]);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/products/101   (ADMIN only)
// Fails with 409 if the product still has inventory or appears in orders;
// the foreign keys in schema.sql enforce that, not this code.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!hasRole(user, "ADMIN")) {
      return jsonError(403, "Only administrators can delete products.");
    }
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid product id.");

    const { rowCount } = await pool.query(
      "DELETE FROM product WHERE product_id = $1 AND organization_id = $2",
      [id, user.organizationId],
    );
    if (rowCount === 0) return jsonError(404, "Product not found.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
