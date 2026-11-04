import { cookies } from "next/headers";
import { z } from "zod";
import pool from "@/lib/db";
import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { ORGANIZATION_COOKIE } from "@/lib/organization";

const switchSchema = z.object({
  organization_id: z.number().int().positive(),
});

// PUT /api/organizations/current
// Body: { organization_id }
// Switches the active organization by setting the cookie the API reads.
export async function PUT(request: Request) {
  try {
    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const { organization_id } = switchSchema.parse(body);

    const { rowCount } = await pool.query(
      "SELECT 1 FROM organization WHERE organization_id = $1",
      [organization_id],
    );
    if (rowCount === 0) return jsonError(404, "Organization not found.");

    (await cookies()).set(ORGANIZATION_COOKIE, String(organization_id), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // one year
    });

    return Response.json({ organization_id });
  } catch (err) {
    return handleRouteError(err);
  }
}
