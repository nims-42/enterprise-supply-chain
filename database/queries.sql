-- =============================================================================
-- Enterprise Supply Chain Management System
-- database/queries.sql
--
-- Demonstration queries against the seed data. Run after schema.sql + seed.sql:
--     psql -U postgres -d enterprise_supply_chain -f database/queries.sql
--
-- Every query is scoped to one organization (organization_id = 1, Vertex
-- Electronics). The API does the same with the logged-in user's organization,
-- so one tenant never sees another tenant's rows.
--
-- Queries that compare against CURRENT_DATE (overdue shipments) depend on
-- when you run them; the seed data is set around late September 2026.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Q1. INNER JOIN (4 tables): full breakdown of one order
-- -----------------------------------------------------------------------------
SELECT o.order_id,
       c.name                        AS customer,
       p.name                        AS product,
       oi.quantity,
       oi.unit_price,
       oi.quantity * oi.unit_price   AS line_total
FROM customer_order o
INNER JOIN customer   c  ON c.customer_id = o.customer_id
INNER JOIN order_item oi ON oi.order_id   = o.order_id
INNER JOIN product    p  ON p.product_id  = oi.product_id
WHERE o.organization_id = 1
  AND o.order_id = 1001
ORDER BY line_total DESC;


-- -----------------------------------------------------------------------------
-- Q2. LEFT JOIN: every warehouse with its manager.
-- An INNER JOIN would silently drop Pune West Hub, which has no manager.
-- -----------------------------------------------------------------------------
SELECT w.name                              AS warehouse,
       w.location,
       COALESCE(u.name, '(no manager)')    AS manager
FROM warehouse w
LEFT JOIN app_user u ON u.user_id = w.manager_id
WHERE w.organization_id = 1
ORDER BY w.name;


-- -----------------------------------------------------------------------------
-- Q3. LEFT JOIN + IS NULL: customers who have never placed an order
-- -----------------------------------------------------------------------------
SELECT c.customer_id, c.name, c.created_at::date AS customer_since
FROM customer c
LEFT JOIN customer_order o ON o.customer_id = c.customer_id
WHERE c.organization_id = 1
  AND o.order_id IS NULL;


-- -----------------------------------------------------------------------------
-- Q4. NOT EXISTS subquery: products not stocked in any warehouse
-- -----------------------------------------------------------------------------
SELECT p.product_id, p.sku, p.name
FROM product p
WHERE p.organization_id = 1
  AND NOT EXISTS (
        SELECT 1 FROM inventory i WHERE i.product_id = p.product_id
  );


-- -----------------------------------------------------------------------------
-- Q5. Calculated field + JOIN: stock below reorder level, per warehouse
-- available = quantity - reserved_quantity
-- -----------------------------------------------------------------------------
SELECT w.name                                  AS warehouse,
       p.name                                  AS product,
       i.quantity,
       i.reserved_quantity,
       i.quantity - i.reserved_quantity        AS available,
       p.reorder_level,
       p.reorder_level - (i.quantity - i.reserved_quantity) AS shortfall
FROM inventory i
JOIN warehouse w ON w.warehouse_id = i.warehouse_id
JOIN product   p ON p.product_id   = i.product_id
WHERE w.organization_id = 1
  AND i.quantity - i.reserved_quantity <= p.reorder_level
ORDER BY shortfall DESC, warehouse;


-- -----------------------------------------------------------------------------
-- Q6. GROUP BY + aggregates: revenue per customer (completed orders only)
-- -----------------------------------------------------------------------------
SELECT c.name                         AS customer,
       COUNT(o.order_id)              AS completed_orders,
       SUM(o.total_amount)            AS total_revenue,
       ROUND(AVG(o.total_amount), 2)  AS avg_order_value,
       MAX(o.order_date)::date        AS last_order
FROM customer c
JOIN customer_order o ON o.customer_id = c.customer_id
WHERE c.organization_id = 1
  AND o.status = 'COMPLETED'
GROUP BY c.customer_id, c.name
ORDER BY total_revenue DESC;


-- -----------------------------------------------------------------------------
-- Q7. HAVING: customers whose completed business is above 5 lakh.
-- WHERE filters rows before grouping; HAVING filters the groups after.
-- -----------------------------------------------------------------------------
SELECT c.name               AS customer,
       SUM(o.total_amount)  AS total_revenue
FROM customer c
JOIN customer_order o ON o.customer_id = c.customer_id
WHERE c.organization_id = 1
  AND o.status = 'COMPLETED'
GROUP BY c.customer_id, c.name
HAVING SUM(o.total_amount) > 500000
ORDER BY total_revenue DESC;


-- -----------------------------------------------------------------------------
-- Q8. GROUP BY category: stock position and stock value across warehouses
-- -----------------------------------------------------------------------------
SELECT p.category,
       COUNT(DISTINCT p.product_id)                    AS products,
       SUM(i.quantity)                                 AS units_on_hand,
       SUM(i.reserved_quantity)                        AS units_reserved,
       SUM(i.quantity * p.unit_price)                  AS stock_value
FROM product p
JOIN inventory i ON i.product_id = p.product_id
WHERE p.organization_id = 1
GROUP BY p.category
ORDER BY stock_value DESC;


-- -----------------------------------------------------------------------------
-- Q9. Correlated subquery: products priced above their own category's average
-- -----------------------------------------------------------------------------
SELECT p.category, p.name, p.unit_price
FROM product p
WHERE p.organization_id = 1
  AND p.unit_price > (
        SELECT AVG(p2.unit_price)
        FROM product p2
        WHERE p2.organization_id = p.organization_id
          AND p2.category        = p.category
  )
ORDER BY p.category, p.unit_price DESC;


-- -----------------------------------------------------------------------------
-- Q10. IN subquery: customers who have bought any laptop
-- -----------------------------------------------------------------------------
SELECT c.name AS customer
FROM customer c
WHERE c.organization_id = 1
  AND c.customer_id IN (
        SELECT o.customer_id
        FROM customer_order o
        JOIN order_item oi ON oi.order_id  = o.order_id
        JOIN product    p  ON p.product_id = oi.product_id
        WHERE p.category = 'Laptops'
          AND o.status  <> 'CANCELLED'
  )
ORDER BY c.name;


-- -----------------------------------------------------------------------------
-- Q11. Top 5 products by units sold (cancelled orders excluded)
-- -----------------------------------------------------------------------------
SELECT p.name,
       SUM(oi.quantity)                  AS units_sold,
       SUM(oi.quantity * oi.unit_price)  AS revenue
FROM order_item oi
JOIN customer_order o ON o.order_id   = oi.order_id
JOIN product        p ON p.product_id = oi.product_id
WHERE o.organization_id = 1
  AND o.status <> 'CANCELLED'
GROUP BY p.product_id, p.name
ORDER BY units_sold DESC
LIMIT 5;


-- -----------------------------------------------------------------------------
-- Q12. Cheapest ACTIVE supplier for each product (window function).
-- ROW_NUMBER ranks suppliers per product by price; we keep rank 1.
-- Metro Electronics is cheaper for some items but SUSPENDED, so it is skipped.
-- -----------------------------------------------------------------------------
SELECT product, supplier, supply_price, lead_time_days
FROM (
    SELECT p.name          AS product,
           pr.name         AS supplier,
           pp.supply_price,
           pp.lead_time_days,
           ROW_NUMBER() OVER (PARTITION BY p.product_id
                              ORDER BY pp.supply_price, pp.lead_time_days) AS rn
    FROM producer_product pp
    JOIN producer pr ON pr.producer_id = pp.producer_id
    JOIN product  p  ON p.product_id   = pp.product_id
    WHERE p.organization_id = 1
      AND pr.status = 'ACTIVE'
) ranked
WHERE rn = 1
ORDER BY product;


-- -----------------------------------------------------------------------------
-- Q13. Products with more than one supplier (the M:N relationship in action)
-- -----------------------------------------------------------------------------
SELECT p.name,
       COUNT(*)                                   AS suppliers,
       MIN(pp.supply_price)                       AS lowest_price,
       MAX(pp.supply_price)                       AS highest_price,
       STRING_AGG(pr.name, ', ' ORDER BY pr.name) AS supplier_names
FROM product p
JOIN producer_product pp ON pp.product_id = p.product_id
JOIN producer         pr ON pr.producer_id = pp.producer_id
WHERE p.organization_id = 1
GROUP BY p.product_id, p.name
HAVING COUNT(*) > 1
ORDER BY suppliers DESC, p.name;


-- -----------------------------------------------------------------------------
-- Q14. CASE: on-time vs late delivery for delivered shipments
-- -----------------------------------------------------------------------------
SELECT s.shipment_id,
       s.order_id,
       w.name                               AS from_warehouse,
       s.expected_delivery,
       s.actual_delivery::date              AS delivered_on,
       CASE
           WHEN s.actual_delivery::date <= s.expected_delivery THEN 'ON TIME'
           ELSE 'LATE by ' || (s.actual_delivery::date - s.expected_delivery) || ' day(s)'
       END                                  AS delivery_result
FROM shipment s
JOIN customer_order o ON o.order_id     = s.order_id
JOIN warehouse      w ON w.warehouse_id = s.warehouse_id
WHERE o.organization_id = 1
  AND s.status = 'DELIVERED'
ORDER BY s.shipment_id;


-- -----------------------------------------------------------------------------
-- Q15. Aggregate with FILTER: on-time delivery rate per warehouse
-- -----------------------------------------------------------------------------
SELECT w.name AS warehouse,
       COUNT(*) AS delivered,
       COUNT(*) FILTER (WHERE s.actual_delivery::date <= s.expected_delivery) AS on_time,
       ROUND(100.0 * COUNT(*) FILTER (WHERE s.actual_delivery::date <= s.expected_delivery)
             / COUNT(*), 1) AS on_time_pct
FROM shipment s
JOIN warehouse w ON w.warehouse_id = s.warehouse_id
WHERE w.organization_id = 1
  AND s.status = 'DELIVERED'
GROUP BY w.warehouse_id, w.name
ORDER BY on_time_pct DESC;


-- -----------------------------------------------------------------------------
-- Q16. Shipments that are late right now: past expected date, not delivered
-- -----------------------------------------------------------------------------
SELECT s.shipment_id,
       s.order_id,
       c.name                                AS customer,
       s.status,
       s.expected_delivery,
       CURRENT_DATE - s.expected_delivery    AS days_overdue,
       t.vehicle_number
FROM shipment s
JOIN customer_order o ON o.order_id    = s.order_id
JOIN customer       c ON c.customer_id = o.customer_id
LEFT JOIN transport t ON t.transport_id = s.transport_id
WHERE o.organization_id = 1
  AND s.status NOT IN ('DELIVERED', 'CANCELLED')
  AND s.expected_delivery < CURRENT_DATE
ORDER BY days_overdue DESC;


-- -----------------------------------------------------------------------------
-- Q17. Monthly sales trend (date_trunc + GROUP BY)
-- -----------------------------------------------------------------------------
SELECT to_char(date_trunc('month', o.order_date), 'YYYY-MM') AS month,
       COUNT(*)                                             AS orders,
       SUM(o.total_amount)                                  AS order_value
FROM customer_order o
WHERE o.organization_id = 1
  AND o.status <> 'CANCELLED'
GROUP BY date_trunc('month', o.order_date)
ORDER BY month;


-- -----------------------------------------------------------------------------
-- Q18. Warehouse utilisation: units held against capacity
-- -----------------------------------------------------------------------------
SELECT w.name                                            AS warehouse,
       w.capacity,
       COALESCE(SUM(i.quantity), 0)                      AS units_held,
       ROUND(100.0 * COALESCE(SUM(i.quantity), 0) / w.capacity, 2) AS utilisation_pct,
       COUNT(i.product_id)                               AS distinct_products
FROM warehouse w
LEFT JOIN inventory i ON i.warehouse_id = w.warehouse_id
WHERE w.organization_id = 1
GROUP BY w.warehouse_id, w.name, w.capacity
ORDER BY utilisation_pct DESC;


-- -----------------------------------------------------------------------------
-- Q19. Scalar subqueries: the four dashboard counters in one row
-- -----------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM product   WHERE organization_id = 1)                AS products,
    (SELECT COUNT(*) FROM warehouse WHERE organization_id = 1)                AS warehouses,
    (SELECT COUNT(*) FROM customer_order
      WHERE organization_id = 1 AND status IN ('PENDING', 'CONFIRMED'))       AS open_orders,
    (SELECT COUNT(*) FROM shipment s
       JOIN customer_order o ON o.order_id = s.order_id
      WHERE o.organization_id = 1
        AND s.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELAYED'))              AS active_shipments;


-- -----------------------------------------------------------------------------
-- Q20. Order status breakdown with share of total value
-- (window function over an aggregate)
-- -----------------------------------------------------------------------------
SELECT status,
       COUNT(*)                                                    AS orders,
       SUM(total_amount)                                           AS value,
       ROUND(100.0 * SUM(total_amount) / SUM(SUM(total_amount)) OVER (), 1) AS pct_of_value
FROM customer_order
WHERE organization_id = 1
GROUP BY status
ORDER BY value DESC;
