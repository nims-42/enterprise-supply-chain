import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError } from "@/lib/api";

// GET /api/products/categories
// Distinct categories in use by this organization, for filter dropdowns
// and suggestions in the product form. ("categories" is a fixed folder, so
// Next matches it before the dynamic [id] route.)
export async function GET() {
  try {
    const organizationId = await getCurrentOrganizationId();
    const { rows } = await pool.query(
      `SELECT DISTINCT category
       FROM product
       WHERE organization_id = $1 AND category IS NOT NULL
       ORDER BY category`,
      [organizationId],
    );
    return Response.json(rows.map((row) => row.category as string));
  } catch (err) {
    return handleRouteError(err);
  }
}
