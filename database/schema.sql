-- =============================================================================
-- Enterprise Supply Chain Management System
-- database/schema.sql
--
-- Target: PostgreSQL 15 or newer (developed on 18, tested on 16).
--
-- Run once to create the database (from cmd, not inside this script):
--     psql -U postgres -c "CREATE DATABASE enterprise_supply_chain;"
--
-- Then load this file:
--     psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/schema.sql
--
-- The script is re-runnable: it drops everything first. It runs inside one
-- transaction, so if any statement fails nothing is left half-created.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- DROP (children first, so foreign keys never block a drop)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS shipment         CASCADE;
DROP TABLE IF EXISTS transport        CASCADE;
DROP TABLE IF EXISTS order_item       CASCADE;
DROP TABLE IF EXISTS customer_order   CASCADE;
DROP TABLE IF EXISTS customer         CASCADE;
DROP TABLE IF EXISTS inventory        CASCADE;
DROP TABLE IF EXISTS warehouse        CASCADE;
DROP TABLE IF EXISTS producer_product CASCADE;
DROP TABLE IF EXISTS product          CASCADE;
DROP TABLE IF EXISTS producer         CASCADE;
DROP TABLE IF EXISTS app_user         CASCADE;
DROP TABLE IF EXISTS role             CASCADE;
DROP TABLE IF EXISTS organization     CASCADE;


-- -----------------------------------------------------------------------------
-- ORGANIZATION: a business (tenant) using the platform
-- -----------------------------------------------------------------------------
CREATE TABLE organization (
    organization_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    industry        VARCHAR(100),
    address         TEXT,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_organization_name UNIQUE (name),
    CONSTRAINT ck_organization_email
        CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);


-- -----------------------------------------------------------------------------
-- ROLE: global list of roles (ADMIN, WAREHOUSE_MANAGER, ...)
-- -----------------------------------------------------------------------------
CREATE TABLE role (
    role_id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,

    CONSTRAINT uq_role_name UNIQUE (role_name),
    CONSTRAINT ck_role_name_upper CHECK (role_name = upper(role_name))
);


-- -----------------------------------------------------------------------------
-- APP_USER: people who log in. Named app_user because USER is reserved.
-- -----------------------------------------------------------------------------
CREATE TABLE app_user (
    user_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT       NOT NULL REFERENCES organization (organization_id),
    role_id         SMALLINT     NOT NULL REFERENCES role (role_id),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_app_user_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- bcrypt hashes are 60 chars; this stops a plaintext password slipping in
    CONSTRAINT ck_app_user_password_hash CHECK (length(password_hash) >= 60),
    -- lets other tables point at (organization_id, user_id) together,
    -- which is how we stop cross-organization references (see warehouse)
    CONSTRAINT uq_app_user_org_user UNIQUE (organization_id, user_id)
);

-- Emails must be unique regardless of case: Ela@x.com and ela@x.com are one login
CREATE UNIQUE INDEX uq_app_user_email_lower ON app_user (lower(email));


-- -----------------------------------------------------------------------------
-- PRODUCER: supplier / manufacturer
-- -----------------------------------------------------------------------------
CREATE TABLE producer (
    producer_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT       NOT NULL REFERENCES organization (organization_id),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    address         TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_producer_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    CONSTRAINT ck_producer_email
        CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT uq_producer_org_name UNIQUE (organization_id, name)
);


-- -----------------------------------------------------------------------------
-- PRODUCT: description is also embedded into the vector DB (product_id is
-- the logical link; there is deliberately no FK to the vector store)
-- -----------------------------------------------------------------------------
CREATE TABLE product (
    product_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT        NOT NULL REFERENCES organization (organization_id),
    name            VARCHAR(200)  NOT NULL,
    sku             VARCHAR(64)   NOT NULL,
    description     TEXT,
    category        VARCHAR(100),
    unit_price      NUMERIC(12,2) NOT NULL,
    reorder_level   INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT ck_product_unit_price    CHECK (unit_price >= 0),
    CONSTRAINT ck_product_reorder_level CHECK (reorder_level >= 0),
    -- two organizations may reuse the same SKU; one organization may not
    CONSTRAINT uq_product_org_sku UNIQUE (organization_id, sku)
);


-- -----------------------------------------------------------------------------
-- PRODUCER_PRODUCT: resolves Producer M:N Product
-- -----------------------------------------------------------------------------
CREATE TABLE producer_product (
    producer_id            BIGINT        NOT NULL REFERENCES producer (producer_id) ON DELETE CASCADE,
    product_id             BIGINT        NOT NULL REFERENCES product  (product_id)  ON DELETE CASCADE,
    supply_price           NUMERIC(12,2) NOT NULL,
    lead_time_days         INTEGER       NOT NULL DEFAULT 0,
    minimum_order_quantity INTEGER       NOT NULL DEFAULT 1,

    PRIMARY KEY (producer_id, product_id),
    CONSTRAINT ck_pp_supply_price CHECK (supply_price >= 0),
    CONSTRAINT ck_pp_lead_time    CHECK (lead_time_days >= 0),
    CONSTRAINT ck_pp_moq          CHECK (minimum_order_quantity >= 1)
);


-- -----------------------------------------------------------------------------
-- WAREHOUSE
-- -----------------------------------------------------------------------------
CREATE TABLE warehouse (
    warehouse_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT       NOT NULL REFERENCES organization (organization_id),
    name            VARCHAR(150) NOT NULL,
    location        TEXT         NOT NULL,
    capacity        INTEGER      NOT NULL,
    manager_id      BIGINT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_warehouse_capacity CHECK (capacity > 0),
    CONSTRAINT uq_warehouse_org_name UNIQUE (organization_id, name),
    -- composite FK: the manager must belong to the SAME organization.
    -- If that user is deleted, only manager_id is cleared (PG 15+ syntax),
    -- organization_id is left alone.
    CONSTRAINT fk_warehouse_manager
        FOREIGN KEY (organization_id, manager_id)
        REFERENCES app_user (organization_id, user_id)
        ON DELETE SET NULL (manager_id)
);


-- -----------------------------------------------------------------------------
-- INVENTORY: resolves Warehouse M:N Product (stock of a product in a warehouse)
-- available_quantity = quantity - reserved_quantity is computed in the
-- inventory_status view rather than stored.
-- -----------------------------------------------------------------------------
CREATE TABLE inventory (
    inventory_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id      BIGINT      NOT NULL REFERENCES warehouse (warehouse_id),
    product_id        BIGINT      NOT NULL REFERENCES product   (product_id),
    quantity          INTEGER     NOT NULL DEFAULT 0,
    reserved_quantity INTEGER     NOT NULL DEFAULT 0,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_inventory_warehouse_product UNIQUE (warehouse_id, product_id),
    CONSTRAINT ck_inventory_quantity CHECK (quantity >= 0),
    CONSTRAINT ck_inventory_reserved CHECK (reserved_quantity >= 0),
    -- you can never reserve more than you physically hold
    CONSTRAINT ck_inventory_reserved_le_qty CHECK (reserved_quantity <= quantity)
);


-- -----------------------------------------------------------------------------
-- CUSTOMER
-- -----------------------------------------------------------------------------
CREATE TABLE customer (
    customer_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT       NOT NULL REFERENCES organization (organization_id),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    address         TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_customer_email
        CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT uq_customer_org_customer UNIQUE (organization_id, customer_id)
);


-- -----------------------------------------------------------------------------
-- CUSTOMER_ORDER: named customer_order because ORDER is reserved
-- total_amount is maintained by a trigger on order_item (added later).
-- -----------------------------------------------------------------------------
CREATE TABLE customer_order (
    order_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT        NOT NULL REFERENCES organization (organization_id),
    customer_id     BIGINT        NOT NULL,
    created_by      BIGINT        NOT NULL,
    order_date      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    expected_date   DATE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT ck_order_status CHECK (status IN
        ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT ck_order_total CHECK (total_amount >= 0),
    CONSTRAINT ck_order_expected_date
        CHECK (expected_date IS NULL OR expected_date >= order_date::date),
    -- customer and creating user must both belong to the order's organization
    CONSTRAINT fk_order_customer
        FOREIGN KEY (organization_id, customer_id)
        REFERENCES customer (organization_id, customer_id),
    CONSTRAINT fk_order_created_by
        FOREIGN KEY (organization_id, created_by)
        REFERENCES app_user (organization_id, user_id)
);


-- -----------------------------------------------------------------------------
-- ORDER_ITEM: lines of an order. unit_price is copied at order time so that
-- later price changes on product do not rewrite old orders.
-- -----------------------------------------------------------------------------
CREATE TABLE order_item (
    order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES customer_order (order_id) ON DELETE CASCADE,
    product_id    BIGINT        NOT NULL REFERENCES product (product_id),
    quantity      INTEGER       NOT NULL,
    unit_price    NUMERIC(12,2) NOT NULL,

    CONSTRAINT uq_order_item_order_product UNIQUE (order_id, product_id),
    CONSTRAINT ck_order_item_quantity   CHECK (quantity > 0),
    CONSTRAINT ck_order_item_unit_price CHECK (unit_price >= 0)
);


-- -----------------------------------------------------------------------------
-- TRANSPORT: vehicles / carriers
-- -----------------------------------------------------------------------------
CREATE TABLE transport (
    transport_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT       NOT NULL REFERENCES organization (organization_id),
    vehicle_number  VARCHAR(30)  NOT NULL,
    transport_type  VARCHAR(30)  NOT NULL,
    carrier_name    VARCHAR(150),
    capacity        INTEGER      NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT ck_transport_status CHECK (status IN
        ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE')),
    CONSTRAINT ck_transport_type CHECK (transport_type IN
        ('TRUCK', 'VAN', 'BIKE', 'RAIL', 'AIR', 'SHIP')),
    CONSTRAINT ck_transport_capacity CHECK (capacity > 0),
    CONSTRAINT uq_transport_org_vehicle UNIQUE (organization_id, vehicle_number)
);


-- -----------------------------------------------------------------------------
-- SHIPMENT: an order can ship in several parts, from different warehouses.
-- transport_id and shipment_date stay NULL until a vehicle is assigned
-- and the shipment is dispatched.
-- -----------------------------------------------------------------------------
CREATE TABLE shipment (
    shipment_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id          BIGINT      NOT NULL REFERENCES customer_order (order_id),
    warehouse_id      BIGINT      NOT NULL REFERENCES warehouse (warehouse_id),
    transport_id      BIGINT      REFERENCES transport (transport_id),
    shipment_date     TIMESTAMPTZ,
    expected_delivery DATE,
    actual_delivery   TIMESTAMPTZ,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    CONSTRAINT ck_shipment_status CHECK (status IN
        ('PENDING', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'DELAYED', 'CANCELLED')),
    CONSTRAINT ck_shipment_expected
        CHECK (expected_delivery IS NULL OR shipment_date IS NULL
               OR expected_delivery >= shipment_date::date),
    CONSTRAINT ck_shipment_actual
        CHECK (actual_delivery IS NULL OR shipment_date IS NULL
               OR actual_delivery >= shipment_date),
    -- a delivered shipment must say when it was delivered
    CONSTRAINT ck_shipment_delivered_has_date
        CHECK (status <> 'DELIVERED' OR actual_delivery IS NOT NULL),
    -- once it has left the warehouse it must have a vehicle and a dispatch time
    CONSTRAINT ck_shipment_dispatched_has_transport
        CHECK (status NOT IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED')
               OR (transport_id IS NOT NULL AND shipment_date IS NOT NULL))
);


-- -----------------------------------------------------------------------------
-- INDEXES
-- PostgreSQL indexes primary keys and UNIQUE constraints automatically,
-- but NOT foreign key columns. These cover the joins and filters we use.
-- -----------------------------------------------------------------------------
CREATE INDEX idx_app_user_role          ON app_user (role_id);
CREATE INDEX idx_producer_org           ON producer (organization_id);
CREATE INDEX idx_product_name           ON product (name);
CREATE INDEX idx_product_category       ON product (category);
CREATE INDEX idx_producer_product_prod  ON producer_product (product_id);
CREATE INDEX idx_warehouse_manager      ON warehouse (manager_id);
CREATE INDEX idx_inventory_product      ON inventory (product_id);
CREATE INDEX idx_customer_org           ON customer (organization_id);
CREATE INDEX idx_order_customer         ON customer_order (customer_id);
CREATE INDEX idx_order_status           ON customer_order (organization_id, status);
CREATE INDEX idx_order_date             ON customer_order (order_date DESC);
CREATE INDEX idx_order_item_product     ON order_item (product_id);
CREATE INDEX idx_transport_org_status   ON transport (organization_id, status);
CREATE INDEX idx_shipment_order         ON shipment (order_id);
CREATE INDEX idx_shipment_warehouse     ON shipment (warehouse_id);
CREATE INDEX idx_shipment_transport     ON shipment (transport_id);
CREATE INDEX idx_shipment_status        ON shipment (status);

COMMIT;
