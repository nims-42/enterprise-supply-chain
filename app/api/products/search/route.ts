import type { NextRequest } from "next/server";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError } from "@/lib/api";
import { searchProductsByMeaning } from "@/lib/product-vectors";
import { productSemanticSearchSchema } from "@/lib/validation/product";

// GET /api/products/search?q=wireless+mouse+for+the+office&category=&limit=10
// Search by meaning. The text is turned into a vector and Qdrant finds the
// closest product vectors in this organization; the rows come back from
// PostgreSQL, best match first, each with its similarity score.
// (Search by name or SKU is GET /api/products?q=, which uses ILIKE.)
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = productSemanticSearchSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const data = await searchProductsByMeaning(organizationId, query.q, {
      category: query.category || undefined,
      limit: query.limit,
    });
    return Response.json({ data });
  } catch (err) {
    return handleRouteError(err);
  }
}
