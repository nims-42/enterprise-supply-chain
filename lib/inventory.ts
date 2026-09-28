import type { PoolClient } from "pg";
import { HttpError } from "@/lib/api";

// Server-side helpers shared by the inventory routes. They all take the
// transaction's client, never the pool.

export interface LockedWarehouse {
  warehouse_id: number;
  name: string;
  capacity: number;
}

/**
 * Loads a warehouse of this organization and takes a row lock on it
 * (SELECT ... FOR UPDATE) until the transaction ends.
 *
 * Why lock: capacity is checked as "units already held + new units <=
 * capacity". Two requests adding stock to the same warehouse at the same
 * moment could each see room for their units and together overfill it.
 * With the lock, the second request waits until the first commits and then
 * sees the updated total.
 */
export async function lockWarehouse(
  client: PoolClient,
  warehouseId: number,
  organizationId: number,
): Promise<LockedWarehouse> {
  const { rows } = await client.query(
    `SELECT warehouse_id, name, capacity
     FROM warehouse
     WHERE warehouse_id = $1 AND organization_id = $2
     FOR UPDATE`,
    [warehouseId, organizationId],
  );
  if (rows.length === 0) throw new HttpError(404, "Warehouse not found.");
  return rows[0];
}

/**
 * Locks several warehouses, always in ascending id order. If two transfers
 * ran in opposite directions (A->B and B->A) and each locked its source first,
 * each could end up waiting for the other forever: a deadlock. Locking in a
 * fixed order makes that impossible.
 */
export async function lockWarehouses(
  client: PoolClient,
  warehouseIds: number[],
  organizationId: number,
): Promise<Map<number, LockedWarehouse>> {
  const locked = new Map<number, LockedWarehouse>();
  for (const id of [...new Set(warehouseIds)].sort((a, b) => a - b)) {
    locked.set(id, await lockWarehouse(client, id, organizationId));
  }
  return locked;
}

/** Throws 404 unless the product exists in this organization. */
export async function assertProductInOrganization(
  client: PoolClient,
  productId: number,
  organizationId: number,
): Promise<{ name: string }> {
  const { rows } = await client.query(
    "SELECT name FROM product WHERE product_id = $1 AND organization_id = $2",
    [productId, organizationId],
  );
  if (rows.length === 0) throw new HttpError(404, "Product not found.");
  return rows[0];
}

/** Total units currently stored in a warehouse (all products). */
export async function unitsHeld(client: PoolClient, warehouseId: number): Promise<number> {
  const { rows } = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS held FROM inventory WHERE warehouse_id = $1",
    [warehouseId],
  );
  return Number(rows[0].held);
}

/** Throws 409 if adding `extraUnits` would overfill the warehouse. */
export async function assertCapacity(
  client: PoolClient,
  warehouse: LockedWarehouse,
  extraUnits: number,
): Promise<void> {
  if (extraUnits <= 0) return;
  const held = await unitsHeld(client, warehouse.warehouse_id);
  if (held + extraUnits > warehouse.capacity) {
    throw new HttpError(
      409,
      `${warehouse.name} can hold ${warehouse.capacity} units and already holds ${held}. ` +
        `There is room for ${Math.max(0, warehouse.capacity - held)} more.`,
    );
  }
}
