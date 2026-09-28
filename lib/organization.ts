import { cookies } from "next/headers";
import pool from "@/lib/db";
import { HttpError } from "@/lib/api";

/** Cookie set by the organization switcher in the sidebar. */
export const ORGANIZATION_COOKIE = "organization_id";

/**
 * Which organization this request works for.
 *
 * Every route handler calls this and puts the result in its WHERE clause
 * (organization_id = $1), so each organization only ever sees its own
 * products, warehouses, orders and so on.
 *
 * The value comes from the switcher's cookie. If the cookie is missing, or
 * names an organization that doesn't exist, the first organization is used.
 *
 * Note: without login, this cookie is the only thing choosing the
 * organization, and anyone using the app can switch it. The scoping shows
 * how tenants are kept apart in the data layer; it is not access control.
 */
export async function getCurrentOrganizationId(): Promise<number> {
  const raw = (await cookies()).get(ORGANIZATION_COOKIE)?.value;
  const requested = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null;

  // The requested organization if it exists, otherwise the lowest id.
  const { rows } = await pool.query(
    `SELECT organization_id
     FROM organization
     ORDER BY (organization_id = $1::bigint) DESC NULLS LAST, organization_id
     LIMIT 1`,
    [requested],
  );
  if (rows.length === 0) {
    throw new HttpError(503, "No organizations exist yet. Load database/seed.sql first.");
  }
  return rows[0].organization_id;
}
