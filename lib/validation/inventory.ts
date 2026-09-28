import { z } from "zod";

const id = (label: string) =>
  z.number({ error: `Choose a ${label}` }).int().positive(`Choose a ${label}`);

const quantity = z
  .number({ error: "Quantity must be a number" })
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(1_000_000);

/** POST /api/inventory/receive: goods arrive at a warehouse. */
export const receiveStockSchema = z.object({
  warehouse_id: id("warehouse"),
  product_id: id("product"),
  quantity,
});

/** POST /api/inventory/transfer: move stock between two warehouses. */
export const transferStockSchema = z
  .object({
    product_id: id("product"),
    from_warehouse_id: id("source warehouse"),
    to_warehouse_id: id("destination warehouse"),
    quantity,
  })
  .refine((t) => t.from_warehouse_id !== t.to_warehouse_id, {
    message: "Source and destination must be different warehouses",
    path: ["to_warehouse_id"],
  });

/** PATCH /api/inventory/[id]: set the counted quantity (stocktake). */
export const adjustStockSchema = z.object({
  quantity: z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative")
    .max(10_000_000),
});

/** GET /api/inventory?warehouse_id=&q=&low_stock=true&limit=&offset= */
export const inventoryListQuerySchema = z.object({
  warehouse_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  low_stock: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
