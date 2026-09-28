import { z } from "zod";

export const SHIPMENT_TYPES = ["INBOUND", "OUTBOUND"] as const;
export const SHIPMENT_STATUSES = [
  "CREATED",
  "PACKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "DELAYED",
  "CANCELLED",
] as const;

const id = (message: string) => z.number({ error: message }).int().positive(message);

/**
 * POST /api/shipments: book an INBOUND delivery from a producer.
 * (OUTBOUND shipments are created by confirming an order.)
 */
export const inboundCreateSchema = z.object({
  producer_id: id("Choose a producer"),
  warehouse_id: id("Choose a warehouse"),
  expected_delivery: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected delivery must be YYYY-MM-DD")
    .nullish()
    .transform((v) => v ?? null),
});

/**
 * POST /api/shipments/[id]/status
 *   status        where the shipment moves next
 *   transport_id  the vehicle, when dispatching (required for OUTBOUND)
 *   received      what actually arrived, when delivering an INBOUND shipment
 */
export const statusChangeSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES, { error: "Unknown status" }),
  transport_id: id("Choose a vehicle").nullish().transform((v) => v ?? null),
  received: z
    .array(
      z.object({
        product_id: id("Choose a product"),
        quantity: z
          .number({ error: "Quantity must be a number" })
          .int("Quantity must be a whole number")
          .min(1, "Quantity must be at least 1")
          .max(1_000_000),
      }),
    )
    .max(50)
    .refine(
      (lines) => new Set(lines.map((l) => l.product_id)).size === lines.length,
      "Each product can appear only once",
    )
    .nullish()
    .transform((v) => v ?? null),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

/** GET /api/shipments?type=&status=&warehouse_id=&overdue=true&q=&limit=&offset= */
export const shipmentListQuerySchema = z.object({
  type: z.enum(SHIPMENT_TYPES).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
