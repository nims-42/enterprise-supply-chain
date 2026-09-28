import type { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, escapeLike, handleRouteError, jsonError, readJson } from "@/lib/api";
import { inboundCreateSchema, shipmentListQuerySchema } from "@/lib/validation/shipment";

// GET /api/shipments?type=OUTBOUND&status=IN_TRANSIT&warehouse_id=1&overdue=true&q=abc
// Shipments in both directions, read from the shipment_overview view
// (advanced.sql), which joins order, customer, producer, warehouse and
// vehicle and works out is_overdue. "counterparty" is the customer for
// OUTBOUND and the producer for INBOUND. q matches a shipment number exactly,
// or part of the counterparty's name.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = shipmentListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const shipmentNumber = query.q && /^\d{1,15}$/.test(query.q) ? Number(query.q) : null;
    const nameSearch = query.q && shipmentNumber === null ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT shipment_id, shipment_type, status,
              warehouse_id, warehouse,
              order_id, producer_id, counterparty,
              vehicle_number,
              shipment_date, expected_delivery, actual_delivery,
              is_overdue AS overdue, days_late,
              COUNT(*) OVER () AS total_count
       FROM shipment_overview
       WHERE organization_id = $1
         AND ($2::text   IS NULL OR shipment_type = $2)
         AND ($3::text   IS NULL OR status = $3)
         AND ($4::bigint IS NULL OR warehouse_id = $4)
         AND (NOT $5::boolean OR is_overdue)
         AND ($6::bigint IS NULL OR shipment_id = $6)
         AND ($7::text   IS NULL OR counterparty ILIKE $7)
       ORDER BY shipment_id DESC
       LIMIT $8 OFFSET $9`,
      [
        organizationId,
        query.type ?? null,
        query.status ?? null,
        query.warehouse_id ?? null,
        query.overdue,
        shipmentNumber,
        nameSearch,
        query.limit,
        query.offset,
      ],
    );

    const total = rows.length > 0 ? rows[0].total_count : 0;
    for (const row of rows) delete row.total_count;

    return Response.json({ data: rows, total, limit: query.limit, offset: query.offset });
  } catch (err) {
    return handleRouteError(err);
  }
}

// POST /api/shipments
// Body: { producer_id, warehouse_id, expected_delivery? }
// Books an INBOUND delivery from an active producer to one of our warehouses.
// OUTBOUND shipments are not created here: confirming an order creates them.
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = inboundCreateSchema.parse(body);

    const producer = await pool.query(
      "SELECT name, status FROM producer WHERE producer_id = $1 AND organization_id = $2",
      [input.producer_id, organizationId],
    );
    if (producer.rowCount === 0) throw new HttpError(404, "Producer not found.");
    if (producer.rows[0].status !== "ACTIVE") {
      throw new HttpError(
        409,
        `${producer.rows[0].name} is ${producer.rows[0].status.toLowerCase()}; deliveries can only be booked from active producers.`,
      );
    }

    // INSERT ... SELECT from warehouse: if the warehouse isn't ours, no row
    // matches and nothing is inserted.
    const { rows, rowCount } = await pool.query(
      `INSERT INTO shipment (shipment_type, producer_id, warehouse_id, expected_delivery, status)
       SELECT 'INBOUND', $1, w.warehouse_id, $3, 'CREATED'
       FROM warehouse w
       WHERE w.warehouse_id = $2 AND w.organization_id = $4
       RETURNING shipment_id, shipment_type, producer_id, warehouse_id, expected_delivery, status`,
      [input.producer_id, input.warehouse_id, input.expected_delivery, organizationId],
    );
    if (rowCount === 0) throw new HttpError(404, "Warehouse not found.");

    return Response.json(rows[0], {
      status: 201,
      headers: { Location: `/api/shipments/${rows[0].shipment_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
