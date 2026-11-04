import pool from "@/lib/db";
import { getCurrentOrganizationId } from "@/lib/organization";
import { handleRouteError } from "@/lib/api";

// GET /api/dashboard
// Everything the home page shows, for the current organization, in one
// request. Each block is its own query and they run in parallel; together
// they cover the aggregate side of the project: COUNT, SUM, FILTER, GROUP BY,
// generate_series for empty months, and the two views from advanced.sql.
export async function GET() {
  try {
    const org = await getCurrentOrganizationId();

    const [
      counts,
      stock,
      ordersByStatus,
      recentRevenue,
      monthly,
      shipments,
      lowStock,
      warehouses,
      recentOrders,
      overdue,
      bestSellers,
    ] = await Promise.all([
      // Headline counts. Scalar subqueries keep each count independent.
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM product   WHERE organization_id = $1) AS products,
           (SELECT COUNT(*) FROM warehouse WHERE organization_id = $1) AS warehouses,
           (SELECT COUNT(*) FROM customer  WHERE organization_id = $1) AS customers,
           (SELECT COUNT(*) FROM producer  WHERE organization_id = $1 AND status = 'ACTIVE')
             AS active_producers,
           (SELECT COUNT(*) FROM transport WHERE organization_id = $1 AND status = 'AVAILABLE')
             AS vehicles_available,
           (SELECT COUNT(*) FROM transport WHERE organization_id = $1) AS vehicles_total`,
        [org],
      ),

      // What the stock is worth at list price.
      pool.query(
        `SELECT COALESCE(SUM(v.quantity), 0)                 AS units_on_hand,
                COALESCE(SUM(v.reserved_quantity), 0)        AS units_reserved,
                COALESCE(SUM(v.quantity * p.unit_price), 0)  AS stock_value
         FROM inventory_status v
         JOIN product p ON p.product_id = v.product_id
         WHERE v.organization_id = $1`,
        [org],
      ),

      pool.query(
        `SELECT status, COUNT(*) AS count
         FROM customer_order
         WHERE organization_id = $1
         GROUP BY status`,
        [org],
      ),

      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS revenue_30d,
                COUNT(*)                       AS orders_30d
         FROM customer_order
         WHERE organization_id = $1
           AND status <> 'CANCELLED'
           AND order_date >= now() - interval '30 days'`,
        [org],
      ),

      // Revenue per month for the last six months, in Indian time.
      // generate_series makes a row for every month, so a month with no
      // orders shows as 0 instead of disappearing.
      pool.query(
        `SELECT to_char(m.month, 'YYYY-MM')           AS month,
                COALESCE(SUM(o.total_amount), 0)       AS revenue,
                COUNT(o.order_id)                      AS orders
         FROM generate_series(
                date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '5 months',
                date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),
                interval '1 month') AS m(month)
         LEFT JOIN customer_order o
                ON o.organization_id = $1
               AND o.status <> 'CANCELLED'
               AND date_trunc('month', o.order_date AT TIME ZONE 'Asia/Kolkata') = m.month
         GROUP BY m.month
         ORDER BY m.month`,
        [org],
      ),

      // From the shipment_overview view (advanced.sql).
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('DISPATCHED', 'IN_TRANSIT', 'DELAYED'))
                  AS on_the_road,
                COUNT(*) FILTER (WHERE shipment_type = 'OUTBOUND' AND status IN ('CREATED', 'PACKED'))
                  AS awaiting_dispatch,
                COUNT(*) FILTER (WHERE shipment_type = 'INBOUND'
                                   AND status NOT IN ('DELIVERED', 'CANCELLED'))
                  AS inbound_expected,
                COUNT(*) FILTER (WHERE is_overdue) AS overdue
         FROM shipment_overview
         WHERE organization_id = $1`,
        [org],
      ),

      // Worst first: out of stock, then fully reserved, then low.
      pool.query(
        `SELECT inventory_id, warehouse_id, warehouse, product_id, product, sku,
                quantity, reserved_quantity, available_quantity AS available,
                reorder_level, stock_status,
                COUNT(*) OVER () AS total_count
         FROM inventory_status
         WHERE organization_id = $1 AND stock_status <> 'IN_STOCK'
         ORDER BY CASE stock_status
                    WHEN 'OUT_OF_STOCK'   THEN 0
                    WHEN 'FULLY_RESERVED' THEN 1
                    ELSE 2
                  END,
                  available_quantity - reorder_level,
                  product
         LIMIT 8`,
        [org],
      ),

      // Fullest warehouses first.
      pool.query(
        `SELECT w.warehouse_id, w.name, w.location, w.capacity,
                COALESCE(SUM(i.quantity), 0) AS held
         FROM warehouse w
         LEFT JOIN inventory i ON i.warehouse_id = w.warehouse_id
         WHERE w.organization_id = $1
         GROUP BY w.warehouse_id
         ORDER BY COALESCE(SUM(i.quantity), 0)::numeric / w.capacity DESC, w.name`,
        [org],
      ),

      pool.query(
        `SELECT o.order_id, c.name AS customer_name, o.order_date, o.status, o.total_amount
         FROM customer_order o
         JOIN customer c ON c.customer_id = o.customer_id
         WHERE o.organization_id = $1
         ORDER BY o.order_date DESC, o.order_id DESC
         LIMIT 6`,
        [org],
      ),

      pool.query(
        `SELECT shipment_id, shipment_type, status, counterparty, warehouse,
                expected_delivery, days_late
         FROM shipment_overview
         WHERE organization_id = $1 AND is_overdue
         ORDER BY days_late DESC, shipment_id
         LIMIT 5`,
        [org],
      ),

      // Most units ordered, all time, cancelled orders left out.
      pool.query(
        `SELECT p.product_id, p.name, p.sku,
                SUM(oi.quantity)                 AS units,
                SUM(oi.quantity * oi.unit_price) AS revenue
         FROM order_item oi
         JOIN customer_order o ON o.order_id = oi.order_id
         JOIN product p        ON p.product_id = oi.product_id
         WHERE o.organization_id = $1 AND o.status <> 'CANCELLED'
         GROUP BY p.product_id, p.name, p.sku
         ORDER BY units DESC, revenue DESC
         LIMIT 5`,
        [org],
      ),
    ]);

    const orders: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const row of ordersByStatus.rows) orders[row.status] = row.count;

    const lowStockTotal = lowStock.rows.length > 0 ? lowStock.rows[0].total_count : 0;
    for (const row of lowStock.rows) delete row.total_count;

    return Response.json({
      counts: counts.rows[0],
      stock: stock.rows[0],
      orders: {
        by_status: orders,
        open: orders.PENDING + orders.CONFIRMED + orders.PROCESSING,
        ...recentRevenue.rows[0],
      },
      monthly_revenue: monthly.rows,
      shipments: shipments.rows[0],
      low_stock: { total: lowStockTotal, items: lowStock.rows },
      warehouses: warehouses.rows,
      recent_orders: recentOrders.rows,
      overdue_shipments: overdue.rows,
      best_sellers: bestSellers.rows,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
