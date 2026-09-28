import pool from "@/lib/db";
import { handleRouteError } from "@/lib/api";
import { getCurrentOrganizationId } from "@/lib/organization";

// GET /api/organizations
// All organizations (for the sidebar switcher) and which one is active.
export async function GET() {
  try {
    const current = await getCurrentOrganizationId();
    const { rows } = await pool.query(
      "SELECT organization_id, name, industry FROM organization ORDER BY name",
    );
    return Response.json({ organizations: rows, current_organization_id: current });
  } catch (err) {
    return handleRouteError(err);
  }
}
