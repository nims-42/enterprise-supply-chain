import type { PoolClient } from "pg";
import { HttpError } from "@/lib/api";
import { assertCapacity, lockWarehouse } from "@/lib/inventory";
import type { StatusChangeInput } from "@/lib/validation/shipment";

// The shipment life cycle and everything each step does to the rest of the
// database. Every function here runs inside the caller's transaction.
// inventory.last_updated is never set here: the trigger in advanced.sql
// stamps it whenever a quantity changes.
//
// Lock order used everywhere in the app, so transactions never deadlock:
//   customer_order -> shipment -> transport -> warehouse -> inventory

type Direction = "INBOUND" | "OUTBOUND";
type Status =
  | "CREATED"
  | "PACKED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "DELAYED"
  | "CANCELLED";

/** Which status can follow which, per direction. */
const TRANSITIONS: Record<Direction, Partial<Record<Status, Status[]>>> = {
  OUTBOUND: {
    CREATED: ["PACKED", "CANCELLED"],
    PACKED: ["DISPATCHED", "CANCELLED"],
    DISPATCHED: ["IN_TRANSIT", "DELAYED", "DELIVERED"],
    IN_TRANSIT: ["DELAYED", "DELIVERED"],
    DELAYED: ["IN_TRANSIT", "DELIVERED"],
  },
  INBOUND: {
    CREATED: ["DISPATCHED", "CANCELLED"],
    DISPATCHED: ["IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED"],
    IN_TRANSIT: ["DELAYED", "DELIVERED", "CANCELLED"],
    DELAYED: ["IN_TRANSIT", "DELIVERED", "CANCELLED"],
  },
};

export function nextStatuses(direction: Direction, current: Status): Status[] {
  return TRANSITIONS[direction][current] ?? [];
}

interface ShipmentRow {
  shipment_id: number;
  shipment_type: Direction;
  producer_id: number | null;
  warehouse_id: number;
  order_id: number | null;
  transport_id: number | null;
  status: Status;
}

/**
 * Moves a shipment to input.status and applies every side effect, or throws
 * (and the caller's transaction rolls everything back).
 */
export async function changeShipmentStatus(
  client: PoolClient,
  shipmentId: number,
  input: StatusChangeInput,
  organizationId: number,
): Promise<void> {
  // Find the shipment (ours?) without locking yet, to learn its order.
  const found = await client.query(
    `SELECT s.order_id
     FROM shipment s
     JOIN warehouse w ON w.warehouse_id = s.warehouse_id
     WHERE s.shipment_id = $1 AND w.organization_id = $2`,
    [shipmentId, organizationId],
  );
  if (found.rowCount === 0) throw new HttpError(404, "Shipment not found.");

  // Locks, in the global order: order first, then the shipment itself.
  const orderId: number | null = found.rows[0].order_id;
  if (orderId !== null) {
    await client.query("SELECT 1 FROM customer_order WHERE order_id = $1 FOR UPDATE", [orderId]);
  }
  const locked = await client.query(
    `SELECT shipment_id, shipment_type, producer_id, warehouse_id, order_id,
            transport_id, status
     FROM shipment WHERE shipment_id = $1 FOR UPDATE`,
    [shipmentId],
  );
  const s: ShipmentRow = locked.rows[0];

  const target = input.status as Status;
  const allowed = nextStatuses(s.shipment_type, s.status);
  if (!allowed.includes(target)) {
    throw new HttpError(
      409,
      `A ${s.status.toLowerCase().replace("_", " ")} ${s.shipment_type.toLowerCase()} shipment ` +
        `can't move to ${target.toLowerCase().replace("_", " ")}.` +
        (allowed.length ? ` Allowed next: ${allowed.join(", ")}.` : " It is finished."),
    );
  }

  if (s.shipment_type === "OUTBOUND") {
    await changeOutbound(client, s, target, input, organizationId);
  } else {
    await changeInbound(client, s, target, input, organizationId);
  }
}

async function changeOutbound(
  client: PoolClient,
  s: ShipmentRow,
  target: Status,
  input: StatusChangeInput,
  organizationId: number,
) {
  switch (target) {
    case "DISPATCHED": {
      if (input.transport_id === null) {
        throw new HttpError(400, "Choose a vehicle to dispatch this shipment on.");
      }
      await takeVehicle(client, input.transport_id, organizationId);
      await lockWarehouse(client, s.warehouse_id, organizationId);

      // The goods physically leave: they come off the shelf (quantity) and
      // stop being held for the order (reserved_quantity), in one UPDATE.
      await client.query(
        `UPDATE inventory i
         SET quantity          = i.quantity - oi.quantity,
             reserved_quantity = i.reserved_quantity - oi.quantity
         FROM order_item oi
         WHERE oi.order_id    = $2
           AND i.warehouse_id = $1
           AND i.product_id   = oi.product_id`,
        [s.warehouse_id, s.order_id],
      );
      await client.query(
        `UPDATE shipment
         SET status = 'DISPATCHED', transport_id = $2, shipment_date = now()
         WHERE shipment_id = $1`,
        [s.shipment_id, input.transport_id],
      );
      await client.query(
        "UPDATE customer_order SET status = 'PROCESSING' WHERE order_id = $1 AND status = 'CONFIRMED'",
        [s.order_id],
      );
      return;
    }

    case "DELIVERED": {
      await client.query(
        "UPDATE shipment SET status = 'DELIVERED', actual_delivery = now() WHERE shipment_id = $1",
        [s.shipment_id],
      );
      await releaseVehicle(client, s);
      // The order is complete once none of its shipments is still on the way.
      await client.query(
        `UPDATE customer_order o
         SET status = 'COMPLETED'
         WHERE o.order_id = $1
           AND o.status = 'PROCESSING'
           AND NOT EXISTS (
               SELECT 1 FROM shipment x
               WHERE x.order_id = o.order_id
                 AND x.status NOT IN ('DELIVERED', 'CANCELLED')
           )`,
        [s.order_id],
      );
      return;
    }

    case "CANCELLED": {
      // Still in the warehouse (CREATED/PACKED): give the reservation back.
      await lockWarehouse(client, s.warehouse_id, organizationId);
      await client.query(
        `UPDATE inventory i
         SET reserved_quantity = i.reserved_quantity - oi.quantity
         FROM order_item oi
         WHERE oi.order_id    = $2
           AND i.warehouse_id = $1
           AND i.product_id   = oi.product_id`,
        [s.warehouse_id, s.order_id],
      );
      await client.query("UPDATE shipment SET status = 'CANCELLED' WHERE shipment_id = $1", [
        s.shipment_id,
      ]);
      // With no shipment left, the order goes back to PENDING so it can be
      // confirmed again from another warehouse.
      await client.query(
        `UPDATE customer_order o
         SET status = 'PENDING'
         WHERE o.order_id = $1
           AND o.status = 'CONFIRMED'
           AND NOT EXISTS (
               SELECT 1 FROM shipment x
               WHERE x.order_id = o.order_id AND x.status <> 'CANCELLED'
           )`,
        [s.order_id],
      );
      return;
    }

    default: // PACKED, IN_TRANSIT, DELAYED: status only
      await client.query("UPDATE shipment SET status = $2 WHERE shipment_id = $1", [
        s.shipment_id,
        target,
      ]);
  }
}

async function changeInbound(
  client: PoolClient,
  s: ShipmentRow,
  target: Status,
  input: StatusChangeInput,
  organizationId: number,
) {
  switch (target) {
    case "DISPATCHED": {
      // Producers usually deliver on their own transport; our vehicle is
      // optional here (e.g. when we collect from their factory).
      if (input.transport_id !== null) {
        await takeVehicle(client, input.transport_id, organizationId);
      }
      await client.query(
        `UPDATE shipment
         SET status = 'DISPATCHED', transport_id = $2, shipment_date = now()
         WHERE shipment_id = $1`,
        [s.shipment_id, input.transport_id],
      );
      return;
    }

    case "DELIVERED": {
      // What arrived isn't stored on the shipment (the schema has no table
      // for it), so it is given now and goes straight into inventory.
      const received = input.received ?? [];
      if (received.length === 0) {
        throw new HttpError(400, "Enter what arrived: at least one product and quantity.");
      }

      // Only products this producer actually supplies (producer_product).
      const productIds = received.map((r) => r.product_id);
      const supplied = await client.query(
        `SELECT pp.product_id
         FROM producer_product pp
         JOIN product p ON p.product_id = pp.product_id
         WHERE pp.producer_id = $1
           AND p.organization_id = $2
           AND pp.product_id = ANY($3::bigint[])`,
        [s.producer_id, organizationId, productIds],
      );
      if (supplied.rowCount !== productIds.length) {
        throw new HttpError(409, "Some of those products are not supplied by this producer.");
      }

      if (s.transport_id !== null) {
        await client.query("SELECT 1 FROM transport WHERE transport_id = $1 FOR UPDATE", [
          s.transport_id,
        ]);
      }
      const warehouse = await lockWarehouse(client, s.warehouse_id, organizationId);
      await assertCapacity(
        client,
        warehouse,
        received.reduce((sum, r) => sum + r.quantity, 0),
      );

      // Same upsert as "Receive stock", for every line at once.
      await client.query(
        `INSERT INTO inventory (warehouse_id, product_id, quantity)
         SELECT $1, line.product_id, line.quantity
         FROM unnest($2::bigint[], $3::int[]) AS line (product_id, quantity)
         ON CONFLICT (warehouse_id, product_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
        [s.warehouse_id, productIds, received.map((r) => r.quantity)],
      );
      await client.query(
        "UPDATE shipment SET status = 'DELIVERED', actual_delivery = now() WHERE shipment_id = $1",
        [s.shipment_id],
      );
      await releaseVehicle(client, s);
      return;
    }

    case "CANCELLED": {
      await client.query("UPDATE shipment SET status = 'CANCELLED' WHERE shipment_id = $1", [
        s.shipment_id,
      ]);
      await releaseVehicle(client, s);
      return;
    }

    default: // IN_TRANSIT, DELAYED
      await client.query("UPDATE shipment SET status = $2 WHERE shipment_id = $1", [
        s.shipment_id,
        target,
      ]);
  }
}

/** Locks a vehicle of this organization, requires it AVAILABLE, marks it IN_USE. */
async function takeVehicle(client: PoolClient, transportId: number, organizationId: number) {
  const vehicle = await client.query(
    `SELECT vehicle_number, status FROM transport
     WHERE transport_id = $1 AND organization_id = $2
     FOR UPDATE`,
    [transportId, organizationId],
  );
  if (vehicle.rowCount === 0) throw new HttpError(404, "Vehicle not found.");
  const v = vehicle.rows[0];
  if (v.status !== "AVAILABLE") {
    const why: Record<string, string> = {
      IN_USE: "already out on another shipment",
      MAINTENANCE: "under maintenance",
      INACTIVE: "inactive",
    };
    throw new HttpError(409, `${v.vehicle_number} is ${why[v.status] ?? v.status}.`);
  }
  await client.query("UPDATE transport SET status = 'IN_USE' WHERE transport_id = $1", [
    transportId,
  ]);
}

/** The vehicle is free again unless it is still out on another shipment. */
async function releaseVehicle(client: PoolClient, s: ShipmentRow) {
  if (s.transport_id === null) return;
  await client.query(
    `UPDATE transport t
     SET status = 'AVAILABLE'
     WHERE t.transport_id = $1
       AND t.status = 'IN_USE'
       AND NOT EXISTS (
           SELECT 1 FROM shipment x
           WHERE x.transport_id = t.transport_id
             AND x.shipment_id <> $2
             AND x.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELAYED')
       )`,
    [s.transport_id, s.shipment_id],
  );
}
