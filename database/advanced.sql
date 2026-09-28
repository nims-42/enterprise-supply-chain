-- =============================================================================
-- Enterprise Supply Chain Management System
-- database/advanced.sql
--
-- Views, stored functions, triggers and an extra index, built on the tables
-- in schema.sql. The application depends on these: order totals and
-- inventory.last_updated are maintained by the triggers below, and several
-- API endpoints read from the views.
--
-- Load order on a fresh database:
--     psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/schema.sql
--     psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/advanced.sql
--     psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/seed.sql
--
-- Re-runnable: everything is CREATE OR REPLACE or dropped first. Re-running
-- schema.sql drops the tables (and with them these views and triggers), so
-- run this file again after schema.sql.
-- =============================================================================

BEGIN;


-- =============================================================================
-- STORED FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- calculate_order_total(order_id): sum of quantity * unit_price over the
-- order's lines. 0 for an order with no lines.
-- STABLE: it only reads the database, so PostgreSQL may reuse its result
-- within a single statement.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_order_total(p_order_id BIGINT)
RETURNS NUMERIC(14,2)
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(quantity * unit_price), 0)::NUMERIC(14,2)
    FROM order_item
    WHERE order_id = p_order_id;
$$;


-- -----------------------------------------------------------------------------
-- get_available_inventory(product_id, warehouse_id): unreserved units of a
-- product (quantity - reserved_quantity). Leave warehouse_id out, or pass
-- NULL, for the total across all warehouses.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_available_inventory(
    p_product_id   BIGINT,
    p_warehouse_id BIGINT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(quantity - reserved_quantity), 0)::INTEGER
    FROM inventory
    WHERE product_id = p_product_id
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
$$;


-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Keep customer_order.total_amount equal to the sum of its lines.
-- Fires after every INSERT, UPDATE or DELETE on order_item, so no code
-- anywhere has to remember to recalculate the total.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_refresh_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- NEW exists for INSERT/UPDATE, OLD for UPDATE/DELETE. If an UPDATE moved
    -- a line to a different order, both orders need recalculating.
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE customer_order
        SET total_amount = calculate_order_total(NEW.order_id)
        WHERE order_id = NEW.order_id;
    END IF;

    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.order_id <> NEW.order_id) THEN
        UPDATE customer_order
        SET total_amount = calculate_order_total(OLD.order_id)
        WHERE order_id = OLD.order_id;
    END IF;

    RETURN NULL;  -- AFTER trigger: the return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_order_item_total ON order_item;
CREATE TRIGGER trg_order_item_total
AFTER INSERT OR UPDATE OR DELETE ON order_item
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_order_total();


-- -----------------------------------------------------------------------------
-- Stamp inventory.last_updated whenever the stock level changes.
-- PostgreSQL's equivalent of MySQL's "ON UPDATE CURRENT_TIMESTAMP" (in the
-- MySQL DDL). The WHEN clause means updates that don't touch the quantities
-- leave the timestamp alone.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_touch_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_updated := now();
    RETURN NEW;  -- BEFORE trigger: the row returned is the row that gets saved
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_last_updated ON inventory;
CREATE TRIGGER trg_inventory_last_updated
BEFORE UPDATE ON inventory
FOR EACH ROW
WHEN (OLD.quantity          IS DISTINCT FROM NEW.quantity
   OR OLD.reserved_quantity IS DISTINCT FROM NEW.reserved_quantity)
EXECUTE FUNCTION trg_touch_inventory();


-- =============================================================================
-- VIEWS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inventory_status: every stock row with names, the calculated available
-- quantity and a stock status. organization_id comes from the warehouse, so
-- the API can scope it like a table.
--
-- stock_status, checked in this order:
--   OUT_OF_STOCK    nothing on the shelf
--   FULLY_RESERVED  all of it is held for open orders
--   LOW_STOCK       available is at or below the product's reorder level
--   IN_STOCK        otherwise
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW inventory_status AS
SELECT i.inventory_id,
       w.organization_id,
       i.warehouse_id,
       w.name                             AS warehouse,
       i.product_id,
       p.name                             AS product,
       p.sku,
       p.category,
       i.quantity,
       i.reserved_quantity,
       i.quantity - i.reserved_quantity   AS available_quantity,
       p.reorder_level,
       CASE
           WHEN i.quantity = 0                               THEN 'OUT_OF_STOCK'
           WHEN i.quantity - i.reserved_quantity <= 0        THEN 'FULLY_RESERVED'
           WHEN i.quantity - i.reserved_quantity <= p.reorder_level THEN 'LOW_STOCK'
           ELSE                                                   'IN_STOCK'
       END                                AS stock_status,
       i.last_updated
FROM inventory i
JOIN warehouse w ON w.warehouse_id = i.warehouse_id
JOIN product   p ON p.product_id   = i.product_id;


-- -----------------------------------------------------------------------------
-- shipment_overview: a shipment with everything around it in one row: the
-- order and customer (OUTBOUND) or producer (INBOUND), the warehouse and the
-- vehicle, plus whether it is overdue and by how many days.
-- LEFT JOINs because each shipment has only one side filled in, and a
-- vehicle only once dispatched.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW shipment_overview AS
SELECT s.shipment_id,
       w.organization_id,
       s.shipment_type,
       s.status,
       s.warehouse_id,
       w.name                                AS warehouse,
       s.order_id,
       o.status                              AS order_status,
       c.customer_id,
       c.name                                AS customer_name,
       s.producer_id,
       pr.name                               AS producer_name,
       COALESCE(c.name, pr.name)             AS counterparty,
       s.transport_id,
       t.vehicle_number,
       t.carrier_name,
       s.shipment_date,
       s.expected_delivery,
       s.actual_delivery,
       (s.expected_delivery < CURRENT_DATE
        AND s.status NOT IN ('DELIVERED', 'CANCELLED'))  AS is_overdue,
       -- delivered: how late it arrived; still open: how late it is so far
       CASE
           WHEN s.expected_delivery IS NULL THEN NULL
           WHEN s.status = 'DELIVERED'
               THEN GREATEST(s.actual_delivery::date - s.expected_delivery, 0)
           WHEN s.status <> 'CANCELLED'
               THEN GREATEST(CURRENT_DATE - s.expected_delivery, 0)
       END                                   AS days_late
FROM shipment s
JOIN warehouse w           ON w.warehouse_id = s.warehouse_id
LEFT JOIN customer_order o ON o.order_id     = s.order_id
LEFT JOIN customer c       ON c.customer_id  = o.customer_id
LEFT JOIN producer pr      ON pr.producer_id = s.producer_id
LEFT JOIN transport t      ON t.transport_id = s.transport_id;


-- =============================================================================
-- EXTRA INDEX
-- =============================================================================

-- Partial index: only shipments that are still open. The overdue check
-- ("expected before today and not delivered/cancelled") only ever looks at
-- those, so the index stays small while delivered history keeps growing.
DROP INDEX IF EXISTS idx_shipment_open_expected;
CREATE INDEX idx_shipment_open_expected
    ON shipment (expected_delivery)
    WHERE status NOT IN ('DELIVERED', 'CANCELLED');

COMMIT;
