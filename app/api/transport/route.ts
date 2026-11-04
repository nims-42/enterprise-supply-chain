import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, handleRouteError, jsonError, readJson } from "@/lib/api";
import { transportInputSchema, transportListQuerySchema } from "@/lib/validation/transport";

// GET /api/transport?status=AVAILABLE
// This organization's vehicles, each with the shipment it is currently on
// (if any) and how many trips it has made. The LATERAL subquery picks the one
// active shipment per vehicle.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = transportListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const { rows } = await pool.query(
      `SELECT t.transport_id, t.vehicle_number, t.transport_type, t.carrier_name,
              t.capacity, t.status,
              active.shipment_id AS current_shipment_id,
              (SELECT COUNT(*) FROM shipment s
                WHERE s.transport_id = t.transport_id
                  AND s.status = 'DELIVERED')      AS completed_trips
       FROM transport t
       LEFT JOIN LATERAL (
           SELECT s.shipment_id
           FROM shipment s
           WHERE s.transport_id = t.transport_id
             AND s.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELAYED')
           ORDER BY s.shipment_date DESC
           LIMIT 1
       ) active ON true
       WHERE t.organization_id = $1
         AND ($2::text IS NULL OR t.status = $2)
       ORDER BY t.vehicle_number`,
      [organizationId, query.status ?? null],
    );
    return Response.json(rows);
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/transport
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = transportInputSchema.parse(body);
    if (input.status === "IN_USE") {
      throw new HttpError(409, "A new vehicle can't start as In use; dispatch a shipment on it.");
    }

    const { rows } = await pool.query(
      `INSERT INTO transport (organization_id, vehicle_number, transport_type, carrier_name, capacity, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING transport_id, vehicle_number, transport_type, carrier_name, capacity, status`,
      [
        organizationId,
        input.vehicle_number,
        input.transport_type,
        input.carrier_name,
        input.capacity,
        input.status,
      ],
    );

    const transport = rows[0];
    return Response.json(transport, {
      status: 201,
      headers: { Location: `/api/transport/${transport.transport_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
