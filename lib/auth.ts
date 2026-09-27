export type Role = "ADMIN" | "WAREHOUSE_MANAGER" | "SALES_MANAGER" | "STAFF";

export interface CurrentUser {
  userId: number;
  organizationId: number;
  role: Role;
}

/**
 * Who is making this request.
 *
 * TEMPORARY (until step 13, authentication): every request acts as
 * Priya Raman, ADMIN of organization 1 (Vertex Electronics) from seed.sql.
 *
 * Route handlers already take organizationId and role from here and never
 * from the request body, so once real sessions exist only this function
 * changes. The API code stays the same.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  return { userId: 1, organizationId: 1, role: "ADMIN" };
}

export function hasRole(user: CurrentUser, ...allowed: Role[]): boolean {
  return allowed.includes(user.role);
}
