import { z } from "zod";

/**
 * Body for POST /api/warehouses and PUT /api/warehouses/[id].
 * capacity = how many stock units the warehouse can hold.
 */
export const warehouseInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  location: z.string().trim().min(1, "Location is required").max(500),
  capacity: z
    .number({ error: "Capacity must be a number" })
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1")
    .max(10_000_000),
});

export type WarehouseInput = z.infer<typeof warehouseInputSchema>;
