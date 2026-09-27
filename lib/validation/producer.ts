import { z } from "zod";

export const PRODUCER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

// Same pattern as the CHECK constraint in schema.sql, so the browser, the
// API and the database all agree on what a valid email looks like.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/**
 * Body for POST /api/producers and PUT /api/producers/[id].
 * As with products, organization_id is never accepted from the client.
 */
export const producerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  email: optionalText(255).refine(
    (email) => email === null || EMAIL_PATTERN.test(email),
    "Enter a valid email address",
  ),
  phone: optionalText(30).refine(
    (phone) => phone === null || /^[0-9+()\-\s]{6,30}$/.test(phone),
    "Phone may contain digits, spaces, +, - and brackets",
  ),
  address: optionalText(500),
  status: z.enum(PRODUCER_STATUSES).default("ACTIVE"),
});

export type ProducerInput = z.infer<typeof producerInputSchema>;

/** The terms on a producer_product row. */
export const supplyTermsSchema = z.object({
  supply_price: z
    .number({ error: "Supply price must be a number" })
    .min(0, "Supply price cannot be negative")
    .max(9_999_999_999.99),
  lead_time_days: z
    .number({ error: "Lead time must be a number" })
    .int("Lead time must be whole days")
    .min(0, "Lead time cannot be negative")
    .max(365, "Lead time is capped at 365 days"),
  minimum_order_quantity: z
    .number({ error: "Minimum order must be a number" })
    .int("Minimum order must be a whole number")
    .min(1, "Minimum order must be at least 1")
    .max(1_000_000),
});

export type SupplyTerms = z.infer<typeof supplyTermsSchema>;

/** POST /api/producers/[id]/products: link a product with its terms. */
export const addSupplySchema = supplyTermsSchema.extend({
  product_id: z.number({ error: "Choose a product" }).int().positive("Choose a product"),
});

export type AddSupplyInput = z.infer<typeof addSupplySchema>;

/** GET /api/producers?q=&status=&limit=&offset= */
export const producerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
