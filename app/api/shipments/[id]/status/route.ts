import { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError, jsonError, parseId, readJson } from "@/lib/api";
import { changeShipmentStatus } from "@/lib/shipments";
import { statusChangeSchema } from "@/lib/validation/shipment";

type Context = { params: Promise<{ id: string }> };

// POST /api/shipments/509/status
// Body: { status, transport_id?, received? }
//
// Moves a shipment one step through its life cycle. Each step is one
// transaction with its side effects, for example:
//   OUTBOUND -> DISPATCHED  stock leaves the shelf, vehicle IN_USE,
//                           order PROCESSING
//   OUTBOUND -> DELIVERED   vehicle freed, order COMPLETED when nothing
//                           else is still on the way
//   OUTBOUND -> CANCELLED   reservation released, order back to PENDING
//   INBOUND  -> DELIVERED   received goods added to the warehouse
// Invalid moves (e.g. CREATED -> DELIVERED) are refused with 409.
export async function POST(request: Request, { params }: Context) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const id = parseId((await params).id);
    if (id === null) return jsonError(400, "Invalid shipment id.");

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = statusChangeSchema.parse(body);

    await withTransaction((client) => changeShipmentStatus(client, id, input, organizationId));

    return Response.json({ shipment_id: id, status: input.status });
  } catch (err) {
    return handleRouteError(err);
  }
}
