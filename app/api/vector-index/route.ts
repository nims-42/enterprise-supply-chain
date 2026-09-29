import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError } from "@/lib/api";
import { getVectorIndexStatus, rebuildVectorIndex } from "@/lib/product-vectors";

// The search index is the copy of this organization's products in Qdrant.

// GET /api/vector-index
// How it compares with PostgreSQL: up to date, stale, missing or leftover.
export async function GET() {
  try {
    const organizationId = await getCurrentOrganizationId();
    return Response.json(await getVectorIndexStatus(organizationId));
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/vector-index
// Re-embeds every product of this organization and removes leftovers.
// Saves through the app keep Qdrant in sync by themselves, and an empty
// index is filled on first search. This is for changes made straight in
// PostgreSQL (psql, re-running seed.sql) that the app never saw.
export async function POST() {
  try {
    const organizationId = await getCurrentOrganizationId();
    return Response.json(await rebuildVectorIndex(organizationId));
  } catch (err) {
    return handleRouteError(err);
  }
}
