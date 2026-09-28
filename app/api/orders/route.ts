import type { NextRequest } from "next/server";
import pool, { withTransaction } from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { HttpError, escapeLike, handleRouteError, jsonError, readJson } from "@/lib/api";
import { reserveOrderStock } from "@/lib/orders";
import { orderCreateSchema, orderListQuerySchema } from "@/lib/validation/order";

// GET /api/orders?status=CONFIRMED&customer_id=3&q=1008&limit=25&offset=0
// q matches an order number exactly, or part of a customer's name.
export async function GET(request: NextRequest) {
  try {
    const organizationId = await getCurrentOrganizationId();
    const query = orderListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const orderNumber = query.q && /^\d{1,15}$/.test(query.q) ? Number(query.q) : null;
    const nameSearch = query.q && orderNumber === null ? `%${escapeLike(query.q)}%` : null;

    const { rows } = await pool.query(
      `SELECT o.order_id, o.customer_id, c.name AS customer_name,
              o.order_date, o.expected_date, o.status, o.total_amount,
              COUNT(oi.order_item_id) AS item_count,
              COUNT(*) OVER ()        AS total_count
       FROM customer_order o
       JOIN customer c         ON c.customer_id = o.customer_id
       LEFT JOIN order_item oi ON oi.order_id   = o.order_id
       WHERE o.organization_id = $1
         AND ($2::text   IS NULL OR o.status = $2)
         AND ($3::bigint IS NULL OR o.customer_id = $3)
         AND ($4::bigint IS NULL OR o.order_id = $4)
         AND ($5::text   IS NULL OR c.name ILIKE $5)
       GROUP BY o.order_id, c.name
       ORDER BY o.order_date DESC
       LIMIT $6 OFFSET $7`,
      [
        organizationId,
        query.status ?? null,
        query.customer_id ?? null,
        orderNumber,
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

// POST /api/orders
// Body: { customer_id, expected_date?, warehouse_id?, items: [{ product_id, quantity }] }
//
// The order-creation transaction from the project spec:
//   BEGIN
//     create the order                       (customer_order)
//     create its lines, copying prices       (order_item)
//     reserve stock + create the shipment    (only if warehouse_id is given)
//   COMMIT
// The total is not calculated here: the trigger on order_item
// (trg_order_item_total in advanced.sql) updates it as each line goes in.
// If any step fails, e.g. one product is short, everything is rolled back
// and no half-made order is left behind.
export async function POST(request: Request) {
  try {
    const organizationId = await getCurrentOrganizationId();

    const body = await readJson(request);
    if (body === undefined) return jsonError(400, "Request body must be valid JSON.");
    const input = orderCreateSchema.parse(body);

    const order = await withTransaction(async (client) => {
      const customer = await client.query(
        "SELECT 1 FROM customer WHERE customer_id = $1 AND organization_id = $2",
        [input.customer_id, organizationId],
      );
      if (customer.rowCount === 0) throw new HttpError(404, "Customer not found.");

      const productIds = input.items.map((i) => i.product_id);
      const products = await client.query(
        "SELECT product_id FROM product WHERE organization_id = $1 AND product_id = ANY($2::bigint[])",
        [organizationId, productIds],
      );
      if (products.rowCount !== productIds.length) {
        throw new HttpError(404, "One or more products were not found.");
      }

      const created = await client.query(
        `INSERT INTO customer_order (organization_id, customer_id, expected_date, status)
         VALUES ($1, $2, $3, 'PENDING')
         RETURNING order_id`,
        [organizationId, input.customer_id, input.expected_date],
      );
      const orderId: number = created.rows[0].order_id;

      // unnest() turns the two arrays into rows (product_id, quantity), so all
      // lines go in with one INSERT ... SELECT that also copies each price.
      await client.query(
        `INSERT INTO order_item (order_id, product_id, quantity, unit_price)
         SELECT $1, p.product_id, line.quantity, p.unit_price
         FROM unnest($2::bigint[], $3::int[]) AS line (product_id, quantity)
         JOIN product p ON p.product_id = line.product_id`,
        [orderId, productIds, input.items.map((i) => i.quantity)],
      );

      if (input.warehouse_id !== null) {
        await reserveOrderStock(client, orderId, input.warehouse_id, organizationId);
      }

      const { rows } = await client.query(
        `SELECT order_id, customer_id, order_date, expected_date, status, total_amount
         FROM customer_order WHERE order_id = $1`,
        [orderId],
      );
      return rows[0];
    });

    return Response.json(order, {
      status: 201,
      headers: { Location: `/api/orders/${order.order_id}` },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
