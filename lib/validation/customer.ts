import { z } from "zod";

// Same pattern as the CHECK constraint on customer.email in schema.sql.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/**
 * Body for POST /api/customers and PUT /api/customers/[id].
 * organization_id always comes from the active organization, never the body.
 */
export const customerInputSchema = z.object({
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
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

/** GET /api/customers?q=&limit=&offset= */
export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
