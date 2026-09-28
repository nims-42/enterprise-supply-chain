import { z } from "zod";

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
] as const;

const id = (message: string) => z.number({ error: message }).int().positive(message);

/**
 * Body for POST /api/orders.
 *
 * warehouse_id is optional:
 *   - given   -> stock is reserved there and the order starts CONFIRMED
 *   - omitted -> the order is saved as PENDING with nothing reserved
 *
 * Prices are NOT accepted from the client. The server copies each product's
 * current unit_price into the order line.
 */
export const orderCreateSchema = z.object({
  customer_id: id("Choose a customer"),
  expected_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date must be YYYY-MM-DD")
    .nullish()
    .transform((value) => value ?? null),
  warehouse_id: id("Choose a warehouse").nullish().transform((value) => value ?? null),
  items: z
    .array(
      z.object({
        product_id: id("Choose a product"),
        quantity: z
          .number({ error: "Quantity must be a number" })
          .int("Quantity must be a whole number")
          .min(1, "Quantity must be at least 1")
          .max(100_000),
      }),
    )
    .min(1, "Add at least one product")
    .max(50, "An order can have at most 50 lines")
    .refine(
      (items) => new Set(items.map((i) => i.product_id)).size === items.length,
      "Each product can appear only once; change the quantity instead",
    ),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** POST /api/orders/[id]/confirm */
export const orderConfirmSchema = z.object({
  warehouse_id: id("Choose a warehouse"),
});

/** GET /api/orders?status=&customer_id=&q=&limit=&offset= */
export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
