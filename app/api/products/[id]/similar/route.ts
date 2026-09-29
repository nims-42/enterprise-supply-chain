import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId } from "@/lib/api";
import { findSimilarProducts } from "@/lib/product-vectors";
import { similarProductsQuerySchema } from "@/lib/validation/product";

type Context = { params: Promise<{ id: string }> };

// GET /api/products/101/similar?limit=5
// Products in the same organization whose name, category and description
// are closest in meaning to this one, most similar first.
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid product id.");
    const query = similarProductsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    // Same 404 for "doesn't exist" and "belongs to another organization".
    const found = await pool.query(
      "SELECT 1 FROM product WHERE product_id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (found.rowCount === 0) return jsonError(404, "Product not found.");

    const data = await findSimilarProducts(organizationId, id, query.limit);
    return Response.json({ data });
  } catch (err) {
    return handleRouteError(err);
  }
}
