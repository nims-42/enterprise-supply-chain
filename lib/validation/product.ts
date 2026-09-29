import { z } from "zod";

// Empty or whitespace-only optional text becomes null, so the database
// never stores "" for "not provided".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/**
 * Body for POST /api/products and PUT /api/products/[id].
 *
 * organization_id is deliberately NOT here. It always comes from the logged-in
 * user, and zod drops unknown keys, so a client cannot create or move a
 * product into another organization by adding it to the body.
 */
export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "SKU may contain only letters, digits and hyphens")
    .transform((sku) => sku.toUpperCase()),
  description: optionalText(5000),
  category: optionalText(100),
  unit_price: z
    .number({ error: "Price must be a number" })
    .min(0, "Price cannot be negative")
    .max(9_999_999_999.99),
  reorder_level: z
    .number()
    .int("Reorder level must be a whole number")
    .min(0, "Reorder level cannot be negative")
    .max(1_000_000)
    .default(0),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/** Query string for GET /api/products?q=&category=&limit=&offset= */
export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Query string for GET /api/products/search?q=&category=&limit= (search by meaning) */
export const productSemanticSearchSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(300),
  category: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** Query string for GET /api/products/[id]/similar?limit= */
export const similarProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
