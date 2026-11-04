import pool, { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { transportInputSchema } from "@/lib/validation/transport";

type Context = { params: Promise<{ id: string }> };

// GET /api/transport/3
// The vehicle and every shipment it has carried, newest first.
export async function GET(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid vehicle id.");

    const vehicle = await pool.query(
      `SELECT transport_id, vehicle_number, transport_type, carrier_name, capacity, status
       FROM transport
       WHERE transport_id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (vehicle.rowCount === 0) return jsonError(404, "Vehicle not found.");

    // From the shipment_overview view (advanced.sql); counterparty is the
    // customer (OUTBOUND) or producer (INBOUND).
    const trips = await pool.query(
      `SELECT shipment_id, shipment_type, status, shipment_date,
              expected_delivery, actual_delivery, warehouse, counterparty
       FROM shipment_overview
       WHERE transport_id = $1
       ORDER BY shipment_date DESC NULLS FIRST, shipment_id DESC`,
      [id],
    );

    return Response.json({ ...vehicle.rows[0], shipments: trips.rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

// PUT /api/transport/3   (full update)
export async function PUT(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid vehicle id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = transportInputSchema.parse(body);

    const updated = await withTransaction(async (client) => {
      const current = await client.query(
        "SELECT status FROM transport WHERE transport_id = $1 AND organization_id = $2 FOR UPDATE",
        [id, organizationId],
      );
      if (current.rowCount === 0) throw new HttpError(404, "Vehicle not found.");

      // IN_USE belongs to the shipment workflow, not to this form.
      const wasInUse = current.rows[0].status === "IN_USE";
      if (wasInUse !== (input.status === "IN_USE")) {
        throw new HttpError(
          409,
          wasInUse
            ? "This vehicle is on a shipment. It becomes available when that shipment is delivered."
            : "A vehicle becomes In use by dispatching a shipment on it, not by editing it.",
        );
      }

      const { rows } = await client.query(
        `UPDATE transport
         SET vehicle_number = $3, transport_type = $4, carrier_name = $5,
             capacity = $6, status = $7
         WHERE transport_id = $1 AND organization_id = $2
         RETURNING transport_id, vehicle_number, transport_type, carrier_name, capacity, status`,
        [
          id,
          organizationId,
          input.vehicle_number,
          input.transport_type,
          input.carrier_name,
          input.capacity,
          input.status,
        ],
      );
      return rows[0];
    });

    return Response.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// DELETE /api/transport/3
// Refused once the vehicle has carried any shipment (foreign key from
// shipment); set it to Inactive instead.
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid vehicle id.");

    const { rowCount } = await pool.query(
      "DELETE FROM transport WHERE transport_id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    if (rowCount === 0) return jsonError(404, "Vehicle not found.");

    return new Response(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
