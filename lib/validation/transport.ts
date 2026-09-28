import { z } from "zod";

export const TRANSPORT_TYPES = ["TRUCK", "VAN", "BIKE", "RAIL", "AIR", "SHIP"] as const;
export const TRANSPORT_STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE", "INACTIVE"] as const;

/**
 * Body for POST /api/transport and PUT /api/transport/[id].
 *
 * status may be sent, but IN_USE is controlled by shipments: a vehicle
 * becomes IN_USE when a shipment is dispatched on it and AVAILABLE again when
 * that shipment is delivered or cancelled. The API refuses manual changes
 * into or out of IN_USE.
 */
export const transportInputSchema = z.object({
  vehicle_number: z
    .string()
    .trim()
    .min(4, "Vehicle number is too short")
    .max(30)
    .regex(/^[A-Za-z0-9\- ]+$/, "Use letters, digits, spaces and hyphens only")
    // "ka 01 ab 4521" -> "KA-01-AB-4521"
    .transform((v) => v.toUpperCase().replace(/\s+/g, "-")),
  transport_type: z.enum(TRANSPORT_TYPES, { error: "Choose a transport type" }),
  carrier_name: z
    .string()
    .trim()
    .max(150)
    .nullish()
    .transform((v) => (v ? v : null)),
  capacity: z
    .number({ error: "Capacity must be a number" })
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1 kg")
    .max(1_000_000),
  status: z.enum(TRANSPORT_STATUSES).default("AVAILABLE"),
});

export type TransportInput = z.infer<typeof transportInputSchema>;

/** GET /api/transport?status=AVAILABLE */
export const transportListQuerySchema = z.object({
  status: z.enum(TRANSPORT_STATUSES).optional(),
});
