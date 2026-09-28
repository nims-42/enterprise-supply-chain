-- =============================================================================
-- Enterprise Supply Chain Management System
-- database/seed.sql
--
-- Sample data for development and demos. Load AFTER schema.sql:
--     psql -U postgres -d enterprise_supply_chain -v ON_ERROR_STOP=1 -f database/seed.sql
--
-- Re-runnable: it empties every table first.
--
-- Two organizations on purpose, so multi-tenant rules have something to show:
--   1  Vertex Electronics Distribution  (IT hardware, Bengaluru)   the main demo
--   2  GreenLeaf Foods                  (FMCG, Coimbatore)         smaller
--
-- IDs are written explicitly (OVERRIDING SYSTEM VALUE) so queries and the viva
-- can refer to "product 101" or "order 1008". The identity sequences are moved
-- past these values at the end so new rows from the app don't collide.
--
-- Transport capacity is in kg. Money is in INR.
-- =============================================================================

BEGIN;

TRUNCATE shipment, transport, order_item, customer_order, customer,
         inventory, warehouse, producer_product, product, producer,
         organization
RESTART IDENTITY CASCADE;


-- -----------------------------------------------------------------------------
-- ORGANIZATIONS
-- -----------------------------------------------------------------------------
INSERT INTO organization (organization_id, name, industry, address, email, phone, created_at)
OVERRIDING SYSTEM VALUE VALUES
(1, 'Vertex Electronics Distribution', 'IT Hardware Distribution',
    '4th Floor, Prestige Tech Park, Outer Ring Road, Bengaluru 560103',
    'contact@vertex-electronics.example', '+91 80 4123 7700', '2026-01-10 09:00+05:30'),
(2, 'GreenLeaf Foods', 'FMCG / Food Products',
    '12 Avinashi Road, Peelamedu, Coimbatore 641004',
    'hello@greenleaf-foods.example', '+91 422 256 8800', '2026-03-02 09:00+05:30');


-- -----------------------------------------------------------------------------
-- PRODUCERS (suppliers)
-- -----------------------------------------------------------------------------
INSERT INTO producer (producer_id, organization_id, name, email, phone, address, status, created_at)
OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'Apex Computing Distributors', 'sales@apexcomputing.example',   '+91 80 2555 1010',
    'SP Road, Bengaluru 560002',                  'ACTIVE', '2026-01-20 10:00+05:30'),
(2, 1, 'Silverline Peripherals',      'orders@silverline.example',     '+91 44 2433 9090',
    'Ritchie Street, Chennai 600002',             'ACTIVE', '2026-01-22 10:00+05:30'),
(3, 1, 'Coastal Networking Supplies', 'b2b@coastalnet.example',        '+91 484 240 3322',
    'Kaloor, Kochi 682017',                       'ACTIVE', '2026-01-25 10:00+05:30'),
(4, 1, 'Orbit Display Systems',       'trade@orbitdisplays.example',   '+91 20 2712 4455',
    'Bhosari MIDC, Pune 411026',                  'ACTIVE', '2026-02-02 10:00+05:30'),
(5, 1, 'DataVault Storage Solutions', 'supply@datavault.example',      '+91 40 2311 7788',
    'HITEC City, Hyderabad 500081',               'ACTIVE', '2026-02-05 10:00+05:30'),
-- starts ACTIVE, gets SUSPENDED by an UPDATE in the DML section at the bottom
(6, 1, 'Metro Electronics Wholesale', 'deals@metroelec.example',       '+91 22 2382 6611',
    'Lamington Road, Mumbai 400007',              'ACTIVE', '2026-02-10 10:00+05:30'),
-- GreenLeaf
(7, 2, 'Cauvery Agro Mills',          'mill@cauveryagro.example',      '+91 821 242 5500',
    'Hebbal Industrial Area, Mysuru 570016',      'ACTIVE', '2026-03-05 10:00+05:30'),
(8, 2, 'Nilgiri Estates Trading',     'trade@nilgiriestates.example',  '+91 423 244 1200',
    'Coonoor Road, Ooty 643001',                  'ACTIVE', '2026-03-05 11:00+05:30'),
(9, 2, 'Sunrise Edible Oils',         'sales@sunriseoils.example',     '+91 452 253 7700',
    'Kappalur SIDCO, Madurai 625008',             'ACTIVE', '2026-03-06 10:00+05:30');


-- -----------------------------------------------------------------------------
-- PRODUCTS
-- Descriptions are written as full sentences because they get embedded for
-- similar-product search later. Laptops should land near laptops, headsets
-- near headsets, and so on.
-- -----------------------------------------------------------------------------
INSERT INTO product (product_id, organization_id, name, sku, description, category, unit_price, reorder_level, created_at)
OVERRIDING SYSTEM VALUE VALUES
-- Vertex Electronics: laptops
(101, 1, 'Dell Latitude 15', 'LAP-DEL-L15',
 '15-inch business laptop with 16GB RAM, 512GB SSD and Intel Core Ultra 5 processor. Backlit keyboard, fingerprint reader and three-year onsite warranty.',
 'Laptops', 89500.00, 10, '2026-01-20 12:00+05:30'),
(102, 1, 'Lenovo ThinkPad E14 Gen 6', 'LAP-LEN-E14',
 '14-inch business laptop with AMD Ryzen 5 processor, 16GB RAM and 512GB SSD. Spill-resistant keyboard, light enough for staff who travel.',
 'Laptops', 72000.00, 10, '2026-01-20 12:05+05:30'),
(103, 1, 'HP ProBook 450 G11', 'LAP-HP-450',
 '15.6-inch office laptop with Intel Core i5, 16GB RAM, 512GB SSD, full numeric keypad and a privacy camera shutter.',
 'Laptops', 78500.00, 8, '2026-01-20 12:10+05:30'),
(104, 1, 'Apple MacBook Air 13 M3', 'LAP-APL-MBA13',
 '13-inch thin and light laptop with Apple M3 chip, 16GB unified memory and 512GB SSD. Fanless design and all-day battery life.',
 'Laptops', 114900.00, 5, '2026-01-21 09:00+05:30'),
-- monitors
(105, 1, 'Dell 24 Monitor P2425H', 'MON-DEL-P24',
 '24-inch full HD IPS office monitor with height-adjustable stand, USB-C hub and flicker-free screen for long working hours.',
 'Monitors', 17500.00, 15, '2026-01-21 09:10+05:30'),
(106, 1, 'LG 27UP850 4K Monitor', 'MON-LG-27UP',
 '27-inch 4K UHD IPS monitor with HDR400 and USB-C 96W charging. Colour accurate for design and photo editing work.',
 'Monitors', 38900.00, 6, '2026-01-21 09:20+05:30'),
(107, 1, 'Samsung Odyssey G5 32', 'MON-SAM-G5',
 '32-inch curved QHD gaming monitor with 165Hz refresh rate and 1ms response time.',
 'Monitors', 29900.00, 4, '2026-01-21 09:30+05:30'),
-- never stocked yet: shows up in LEFT JOIN / "no inventory" queries
(123, 1, 'Lenovo ThinkVision T27i', 'MON-LEN-T27',
 '27-inch full HD IPS business monitor with tilt, swivel and height adjustment, built-in USB hub and low blue light mode.',
 'Monitors', 21500.00, 6, '2026-09-20 15:00+05:30'),
-- peripherals
(108, 1, 'Logitech MX Keys S', 'KBD-LOG-MXK',
 'Wireless full-size keyboard with backlit low-profile keys. Connects over Bluetooth or USB receiver and switches between three devices.',
 'Peripherals', 10995.00, 20, '2026-01-22 10:00+05:30'),
(109, 1, 'Logitech MX Master 3S', 'MOU-LOG-MX3S',
 'Wireless ergonomic mouse with quiet clicks, 8000 DPI sensor and USB-C rechargeable battery.',
 'Peripherals', 9495.00, 20, '2026-01-22 10:05+05:30'),
(110, 1, 'TVS Gold Bharat Keyboard', 'KBD-TVS-GOLD',
 'Wired mechanical keyboard with tactile switches and bilingual keycaps, built for heavy daily typing.',
 'Peripherals', 2450.00, 25, '2026-01-22 10:10+05:30'),
(111, 1, 'HP 150 Wired Mouse', 'MOU-HP-150',
 'Basic wired optical USB mouse, 1600 DPI, ambidextrous shape for everyday office desks.',
 'Peripherals', 399.00, 50, '2026-01-22 10:15+05:30'),
-- networking
(112, 1, 'Cisco CBS350-24P Switch', 'NET-CIS-350',
 '24-port gigabit managed PoE+ network switch with 4 SFP uplinks and layer 3 static routing for office networks.',
 'Networking', 64000.00, 3, '2026-01-25 11:00+05:30'),
(113, 1, 'TP-Link TL-SG1016D Switch', 'NET-TPL-1016',
 '16-port gigabit unmanaged desktop network switch, plug and play, for small offices.',
 'Networking', 6200.00, 5, '2026-01-25 11:05+05:30'),
(114, 1, 'Ubiquiti UniFi U6 Pro', 'NET-UBQ-U6P',
 'Wi-Fi 6 ceiling-mounted wireless access point powered over PoE, for dense offices and managed from a central controller.',
 'Networking', 16900.00, 6, '2026-01-25 11:10+05:30'),
-- storage
(115, 1, 'Samsung T7 Shield 1TB', 'STO-SAM-T7',
 'Portable external SSD with 1TB capacity, USB 3.2 and rugged dust and water resistant body.',
 'Storage', 9999.00, 12, '2026-02-05 12:00+05:30'),
(116, 1, 'WD Red Plus 4TB', 'STO-WD-RED4',
 '3.5-inch 4TB NAS hard drive at 5400 RPM, designed for file servers running around the clock.',
 'Storage', 10500.00, 8, '2026-02-05 12:05+05:30'),
(117, 1, 'Seagate One Touch 2TB', 'STO-SEA-OT2',
 'Portable external hard drive with 2TB capacity over USB 3.0, used for laptop backups.',
 'Storage', 6800.00, 10, '2026-02-05 12:10+05:30'),
-- audio
(118, 1, 'Jabra Evolve2 40 Headset', 'AUD-JAB-E240',
 'Wired USB-C stereo headset with noise-cancelling microphone, certified for Microsoft Teams calls.',
 'Audio', 11500.00, 10, '2026-02-08 10:00+05:30'),
(119, 1, 'Logitech H390 USB Headset', 'AUD-LOG-H390',
 'Wired USB headset with noise-cancelling boom microphone and padded ear cups, common in call centres.',
 'Audio', 2295.00, 15, '2026-02-08 10:05+05:30'),
(120, 1, 'Poly Sync 20 Speakerphone', 'AUD-POL-S20',
 'Portable Bluetooth conference speakerphone for small meeting rooms and huddle spaces.',
 'Audio', 13900.00, 5, '2026-02-08 10:10+05:30'),
-- power
(121, 1, 'APC Back-UPS 1100VA', 'PWR-APC-1100',
 'Line-interactive UPS rated 1100VA, gives battery backup to a desktop PC and router during power cuts.',
 'Power', 8900.00, 6, '2026-02-10 10:00+05:30'),
(122, 1, 'Anker 65W USB-C Charger', 'PWR-ANK-65',
 '65W GaN USB-C wall charger that fast charges laptops and phones.',
 'Power', 3499.00, 20, '2026-02-10 10:05+05:30'),
-- GreenLeaf Foods
(201, 2, 'Premium Basmati Rice 5kg', 'RICE-BAS-5',
 'Aged long-grain basmati rice in a 5kg bag, for biryani and pulao.',
 'Grains', 695.00, 40, '2026-03-06 12:00+05:30'),
(202, 2, 'Sona Masoori Rice 25kg', 'RICE-SON-25',
 'Lightweight medium-grain Sona Masoori rice in a 25kg sack for daily South Indian meals.',
 'Grains', 1450.00, 20, '2026-03-06 12:05+05:30'),
(203, 2, 'Cold-Pressed Groundnut Oil 1L', 'OIL-GNT-1',
 'Traditional wood-pressed groundnut oil in a 1 litre bottle.',
 'Edible Oils', 320.00, 30, '2026-03-06 12:10+05:30'),
(204, 2, 'Refined Sunflower Oil 5L', 'OIL-SUN-5',
 'Refined sunflower cooking oil in a 5 litre can for restaurant kitchens.',
 'Edible Oils', 780.00, 20, '2026-03-06 12:15+05:30'),
(205, 2, 'Toor Dal 1kg', 'DAL-TOOR-1',
 'Unpolished split pigeon peas in a 1kg pack, for sambar and dal.',
 'Pulses', 165.00, 50, '2026-03-06 12:20+05:30'),
(206, 2, 'Filter Coffee Powder 500g', 'BEV-COF-500',
 'South Indian filter coffee powder, 80 percent coffee and 20 percent chicory, 500g pack.',
 'Beverages', 290.00, 25, '2026-03-06 12:25+05:30'),
(207, 2, 'Assam CTC Tea 1kg', 'BEV-TEA-1',
 'Strong Assam CTC tea leaves in a 1kg pack, for masala chai.',
 'Beverages', 480.00, 10, '2026-03-06 12:30+05:30');


-- -----------------------------------------------------------------------------
-- PRODUCER_PRODUCT (M:N). Monitors 105 and 123 and products 101, 108, 115
-- have more than one supplier, at different prices and lead times.
-- -----------------------------------------------------------------------------
INSERT INTO producer_product (producer_id, product_id, supply_price, lead_time_days, minimum_order_quantity) VALUES
(1, 101, 76000.00,  7, 5),
(1, 102, 61000.00,  7, 5),
(1, 103, 66500.00, 10, 5),
(1, 104, 99000.00, 14, 2),
(1, 105, 14600.00,  5, 10),
(1, 123, 18000.00, 10, 5),
(2, 108,  8900.00,  4, 10),
(2, 109,  7700.00,  4, 10),
(2, 110,  1900.00,  3, 20),
(2, 111,   280.00,  2, 50),
(2, 118,  9400.00,  6, 5),
(2, 119,  1750.00,  3, 20),
(2, 122,  2700.00,  3, 20),
(3, 112, 53000.00, 12, 1),
(3, 113,  4900.00,  5, 5),
(3, 114, 13800.00,  8, 4),
(3, 121,  7200.00,  6, 5),
(4, 105, 14200.00,  9, 20),
(4, 106, 32500.00, 10, 3),
(4, 107, 24800.00, 10, 3),
(4, 123, 17600.00, 12, 10),
(5, 115,  8100.00,  5, 10),
(5, 116,  8600.00,  6, 8),
(5, 117,  5400.00,  5, 10),
(6, 101, 73500.00, 15, 20),
(6, 108,  8400.00, 10, 25),
(6, 115,  7600.00, 10, 25),
(7, 201,   540.00,  3, 50),
(7, 202,  1150.00,  3, 20),
(7, 205,   128.00,  3, 100),
(8, 206,   215.00,  5, 50),
(8, 207,   360.00,  5, 25),
(9, 203,   245.00,  4, 60),
(9, 204,   610.00,  4, 30);


-- -----------------------------------------------------------------------------
-- WAREHOUSES. capacity is the number of stock units the warehouse can hold.
-- -----------------------------------------------------------------------------
INSERT INTO warehouse (warehouse_id, organization_id, name, location, capacity, created_at)
OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'Bengaluru Central DC',  'Whitefield, Bengaluru, Karnataka',      600, '2026-01-15 09:00+05:30'),
(2, 1, 'Chennai South DC',      'Sriperumbudur, Chennai, Tamil Nadu',    400, '2026-01-18 09:00+05:30'),
(3, 1, 'Pune West Hub',         'Chakan MIDC, Pune, Maharashtra',        250, '2026-04-01 09:00+05:30'),
(4, 2, 'Coimbatore Main Godown','SIDCO Kurichi, Coimbatore, Tamil Nadu', 800, '2026-03-04 09:00+05:30');


-- -----------------------------------------------------------------------------
-- INVENTORY. reserved_quantity starts at 0 and is filled in from open
-- shipments further down, so it always matches the orders.
-- Several rows are deliberately at or below reorder level.
-- -----------------------------------------------------------------------------
INSERT INTO inventory (warehouse_id, product_id, quantity, last_updated) VALUES
-- Bengaluru Central DC
(1, 101,  42, '2026-09-26 18:00+05:30'),
(1, 102,  25, '2026-09-22 17:30+05:30'),
(1, 103,  18, '2026-09-25 11:00+05:30'),
(1, 104,   9, '2026-09-10 16:00+05:30'),
(1, 105,  30, '2026-09-01 12:00+05:30'),
(1, 108,  14, '2026-09-22 17:30+05:30'),
(1, 109,  35, '2026-09-22 17:30+05:30'),
(1, 110,  60, '2026-08-14 10:00+05:30'),
(1, 111, 120, '2026-08-14 10:00+05:30'),
(1, 112,   2, '2026-07-30 15:00+05:30'),
(1, 115,  20, '2026-09-05 14:00+05:30'),
(1, 117,   7, '2026-09-25 11:00+05:30'),
(1, 122,  45, '2026-09-05 14:00+05:30'),
-- Chennai South DC
(2, 101,  15, '2026-08-20 10:00+05:30'),
(2, 105,  22, '2026-09-24 16:00+05:30'),
(2, 106,   5, '2026-09-24 16:00+05:30'),
(2, 107,  11, '2026-07-12 10:00+05:30'),
(2, 113,   9, '2026-09-06 09:30+05:30'),
(2, 114,  12, '2026-09-06 09:30+05:30'),
(2, 116,  16, '2026-08-02 11:00+05:30'),
(2, 118,  25, '2026-08-11 13:00+05:30'),
(2, 119,  40, '2026-08-11 13:00+05:30'),
(2, 120,   4, '2026-08-11 13:00+05:30'),
(2, 121,   8, '2026-09-24 16:00+05:30'),
-- Pune West Hub
(3, 102,   6, '2026-09-15 10:00+05:30'),
(3, 108,  30, '2026-09-15 10:00+05:30'),
(3, 111,  80, '2026-09-27 12:00+05:30'),
(3, 113,   3, '2026-09-15 10:00+05:30'),
(3, 119,  30, '2026-09-27 12:00+05:30'),
(3, 122,  15, '2026-09-15 10:00+05:30'),
-- Coimbatore Main Godown (GreenLeaf)
(4, 201,  60, '2026-09-26 17:00+05:30'),
(4, 202,  35, '2026-09-01 10:00+05:30'),
(4, 203,  90, '2026-09-01 10:00+05:30'),
(4, 204,  18, '2026-09-27 09:00+05:30'),
(4, 205, 150, '2026-09-01 10:00+05:30'),
(4, 206,  70, '2026-09-27 09:00+05:30'),
(4, 207,  15, '2026-09-26 17:00+05:30');


-- -----------------------------------------------------------------------------
-- CUSTOMERS. Horizon Logistics never orders (LEFT JOIN / NOT EXISTS demo).
-- -----------------------------------------------------------------------------
INSERT INTO customer (customer_id, organization_id, name, email, phone, address, created_at)
OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'ABC Retail Pvt Ltd',        'purchase@abcretail.example',   '+91 80 4000 1111',
    'Jayanagar 4th Block, Bengaluru 560011',  '2026-02-15 10:00+05:30'),
(2, 1, 'XYZ Stores',                'procure@xyzstores.example',    '+91 44 4000 2222',
    'T Nagar, Chennai 600017',                '2026-02-20 10:00+05:30'),
(3, 1, 'DEF Corp',                  'it.admin@defcorp.example',     '+91 20 4000 3333',
    'Hinjewadi Phase 1, Pune 411057',         '2026-03-01 10:00+05:30'),
(4, 1, 'Brightpath Academy',        'office@brightpath.example',    '+91 80 4000 4444',
    'Yelahanka New Town, Bengaluru 560064',   '2026-03-12 10:00+05:30'),
(5, 1, 'Nimbus Software Labs',      'facilities@nimbuslabs.example','+91 80 4000 5555',
    'Koramangala, Bengaluru 560034',          '2026-04-02 10:00+05:30'),
(6, 1, 'Cityline Hospitals',        'biomed@cityline.example',      '+91 44 4000 6666',
    'Anna Nagar, Chennai 600040',             '2026-04-18 10:00+05:30'),
(7, 1, 'Kaveri Co-working Spaces',  'ops@kavericowork.example',     '+91 80 4000 7777',
    'HSR Layout, Bengaluru 560102',           '2026-05-05 10:00+05:30'),
(8, 1, 'Horizon Logistics',         'admin@horizonlog.example',     '+91 22 4000 8888',
    'Andheri East, Mumbai 400069',            '2026-09-01 10:00+05:30'),
-- GreenLeaf customers
(9,  2, 'Annapoorna Hotels',        'stores@annapoorna.example',    '+91 422 400 9999',
    'RS Puram, Coimbatore 641002',            '2026-03-15 10:00+05:30'),
(10, 2, 'FreshMart Supermarket',    'buying@freshmart.example',     '+91 422 400 1010',
    'Saibaba Colony, Coimbatore 641011',      '2026-04-01 10:00+05:30'),
(11, 2, 'Udupi Grand Restaurant',   'manager@udupigrand.example',   '+91 422 400 1212',
    'Gandhipuram, Coimbatore 641012',         '2026-06-10 10:00+05:30');


-- -----------------------------------------------------------------------------
-- TRANSPORT
-- -----------------------------------------------------------------------------
INSERT INTO transport (transport_id, organization_id, vehicle_number, transport_type, carrier_name, capacity, status)
OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'KA-01-AB-4521', 'TRUCK', 'In-house fleet',          5000, 'IN_USE'),
(2, 1, 'KA-03-MN-7788', 'VAN',   'In-house fleet',          1200, 'AVAILABLE'),
(3, 1, 'TN-09-BX-3310', 'TRUCK', 'Deccan Freight Carriers', 8000, 'IN_USE'),
(4, 1, 'MH-14-CT-9021', 'VAN',   'SwiftMove Logistics',     1500, 'IN_USE'),
(5, 1, 'KA-05-HJ-1122', 'BIKE',  'In-house fleet',            50, 'AVAILABLE'),
(6, 1, 'TN-22-DK-6060', 'TRUCK', 'Deccan Freight Carriers', 6000, 'MAINTENANCE'),
(7, 2, 'TN-38-AK-2200', 'TRUCK', 'In-house fleet',          4000, 'IN_USE'),
(8, 2, 'TN-37-BB-1515', 'VAN',   'In-house fleet',          1000, 'INACTIVE');


-- -----------------------------------------------------------------------------
-- CUSTOMER ORDERS. total_amount starts at 0 and is calculated from the
-- order items below.
-- -----------------------------------------------------------------------------
INSERT INTO customer_order (order_id, organization_id, customer_id, order_date, expected_date, status)
OVERRIDING SYSTEM VALUE VALUES
-- Vertex Electronics
(1001, 1,  1, '2026-06-05 11:20+05:30', '2026-06-12', 'COMPLETED'),
(1002, 1,  2, '2026-06-18 15:05+05:30', '2026-06-25', 'COMPLETED'),
(1003, 1,  3, '2026-07-02 10:40+05:30', '2026-07-10', 'COMPLETED'),
(1004, 1,  4, '2026-07-15 12:00+05:30', '2026-07-25', 'COMPLETED'),
(1005, 1,  5, '2026-07-28 16:30+05:30', '2026-08-05', 'CANCELLED'),
(1006, 1,  6, '2026-08-10 09:50+05:30', '2026-08-18', 'COMPLETED'),
(1007, 1,  1, '2026-08-22 14:15+05:30', '2026-08-30', 'COMPLETED'),
(1008, 1,  7, '2026-09-05 11:00+05:30', '2026-09-12', 'PROCESSING'),
(1009, 1,  5, '2026-09-15 10:10+05:30', '2026-09-29', 'PROCESSING'),
(1010, 1,  2, '2026-09-19 17:45+05:30', '2026-10-01', 'PROCESSING'),
(1011, 1,  3, '2026-09-22 13:30+05:30', '2026-09-30', 'CONFIRMED'),
(1012, 1,  6, '2026-09-24 10:20+05:30', '2026-10-02', 'CONFIRMED'),
(1013, 1,  1, '2026-09-26 16:00+05:30', '2026-10-05', 'PENDING'),
(1014, 1,  4, '2026-09-27 11:30+05:30', '2026-10-06', 'PENDING'),
-- GreenLeaf
(1015, 2,  9, '2026-09-01 09:30+05:30', '2026-09-04', 'COMPLETED'),
(1016, 2, 10, '2026-09-20 12:00+05:30', '2026-09-29', 'PROCESSING'),
(1017, 2, 11, '2026-09-26 10:45+05:30', '2026-09-30', 'CONFIRMED');


-- -----------------------------------------------------------------------------
-- ORDER ITEMS: INSERT ... SELECT copies the product's current price into
-- the order line, the same thing the API will do.
-- -----------------------------------------------------------------------------
INSERT INTO order_item (order_id, product_id, quantity, unit_price)
SELECT v.order_id, v.product_id, v.quantity, p.unit_price
FROM (VALUES
    (1001, 101, 10), (1001, 105, 10), (1001, 108, 10), (1001, 109, 10),
    (1002, 111, 40), (1002, 110, 20), (1002, 119, 15),
    (1003, 102, 15), (1003, 106,  5),
    (1004, 104,  5), (1004, 115,  5), (1004, 122, 10),
    (1005, 112,  2), (1005, 114,  4),
    (1006, 118, 12), (1006, 120,  3), (1006, 121,  6),
    (1007, 101,  8), (1007, 105, 16),
    (1008, 114,  6), (1008, 113,  2),
    (1009, 103,  6), (1009, 117,  6),
    (1010, 111, 30), (1010, 119, 20),
    (1011, 102, 10), (1011, 108, 10), (1011, 109, 10),
    (1012, 105,  8), (1012, 106,  3), (1012, 121,  4),
    (1013, 101,  5), (1013, 122, 10),
    (1014, 116,  4), (1014, 115,  3),
    (1015, 202, 20), (1015, 205, 50), (1015, 203, 30),
    (1016, 204, 25), (1016, 206, 40),
    (1017, 207, 15), (1017, 201, 30)
) AS v (order_id, product_id, quantity)
JOIN product p ON p.product_id = v.product_id;


-- -----------------------------------------------------------------------------
-- SHIPMENTS, both directions.
-- OUTBOUND (warehouse -> customer): order 1003 ships in two parts from two
-- warehouses (Customer_Order 1:N Shipment).
-- INBOUND (producer -> warehouse): restocking. Producers usually deliver on
-- their own transport, so transport_id is NULL. Metro Electronics' two late
-- deliveries are why it gets suspended in the DML section below.
-- -----------------------------------------------------------------------------
INSERT INTO shipment (shipment_id, shipment_type, producer_id, warehouse_id, order_id, transport_id,
                      shipment_date, expected_delivery, actual_delivery, status)
OVERRIDING SYSTEM VALUE VALUES
-- outbound: Vertex Electronics
(501, 'OUTBOUND', NULL, 1, 1001, 1,    '2026-06-06 10:00+05:30', '2026-06-09', '2026-06-08 16:30+05:30', 'DELIVERED'),
(502, 'OUTBOUND', NULL, 2, 1002, 3,    '2026-06-19 09:30+05:30', '2026-06-23', '2026-06-22 14:10+05:30', 'DELIVERED'),
(503, 'OUTBOUND', NULL, 1, 1003, 2,    '2026-07-03 11:00+05:30', '2026-07-06', '2026-07-05 12:45+05:30', 'DELIVERED'),
(504, 'OUTBOUND', NULL, 2, 1003, 3,    '2026-07-04 08:45+05:30', '2026-07-08', '2026-07-09 17:20+05:30', 'DELIVERED'),
(505, 'OUTBOUND', NULL, 1, 1004, 2,    '2026-07-16 10:30+05:30', '2026-07-19', '2026-07-18 11:00+05:30', 'DELIVERED'),
(506, 'OUTBOUND', NULL, 2, 1006, 3,    '2026-08-11 09:00+05:30', '2026-08-15', '2026-08-17 15:40+05:30', 'DELIVERED'),
(507, 'OUTBOUND', NULL, 1, 1007, 1,    '2026-08-23 10:15+05:30', '2026-08-26', '2026-08-26 13:05+05:30', 'DELIVERED'),
(508, 'OUTBOUND', NULL, 2, 1008, 3,    '2026-09-06 09:20+05:30', '2026-09-10', NULL,                     'DELAYED'),
(509, 'OUTBOUND', NULL, 1, 1009, 1,    '2026-09-25 08:30+05:30', '2026-09-29', NULL,                     'IN_TRANSIT'),
(510, 'OUTBOUND', NULL, 3, 1010, 4,    '2026-09-27 12:00+05:30', '2026-10-01', NULL,                     'DISPATCHED'),
(511, 'OUTBOUND', NULL, 1, 1011, NULL, NULL,                     '2026-09-30', NULL,                     'PACKED'),
(512, 'OUTBOUND', NULL, 2, 1012, NULL, NULL,                     '2026-10-02', NULL,                     'CREATED'),
-- outbound: GreenLeaf
(513, 'OUTBOUND', NULL, 4, 1015, 7,    '2026-09-02 07:30+05:30', '2026-09-04', '2026-09-03 10:15+05:30', 'DELIVERED'),
(514, 'OUTBOUND', NULL, 4, 1016, 7,    '2026-09-27 07:00+05:30', '2026-09-29', NULL,                     'IN_TRANSIT'),
(515, 'OUTBOUND', NULL, 4, 1017, NULL, NULL,                     '2026-09-30', NULL,                     'CREATED'),
-- inbound: Vertex Electronics
(516, 'INBOUND', 6, 1, NULL, NULL,     '2026-07-28 10:00+05:30', '2026-08-05', '2026-08-14 15:00+05:30', 'DELIVERED'),
(517, 'INBOUND', 6, 1, NULL, NULL,     '2026-08-12 10:00+05:30', '2026-08-20', '2026-08-27 12:30+05:30', 'DELIVERED'),
(518, 'INBOUND', 1, 1, NULL, NULL,     '2026-09-18 09:00+05:30', '2026-09-20', '2026-09-20 16:00+05:30', 'DELIVERED'),
(519, 'INBOUND', 5, 1, NULL, NULL,     '2026-09-19 11:00+05:30', '2026-09-23', '2026-09-25 11:00+05:30', 'DELIVERED'),
(520, 'INBOUND', 4, 2, NULL, NULL,     '2026-09-26 08:00+05:30', '2026-10-03', NULL,                     'IN_TRANSIT'),
(521, 'INBOUND', 3, 1, NULL, NULL,     NULL,                     '2026-10-08', NULL,                     'CREATED'),
-- inbound: GreenLeaf
(522, 'INBOUND', 7, 4, NULL, NULL,     '2026-09-24 06:00+05:30', '2026-09-25', '2026-09-25 09:30+05:30', 'DELIVERED');


-- =============================================================================
-- DML DEMONSTRATIONS (UPDATE / DELETE) that also finish the setup
-- =============================================================================

-- UPDATE with a correlated subquery: order totals from their items.
-- (Later a trigger on order_item keeps this current automatically.)
UPDATE customer_order o
SET total_amount = COALESCE((
    SELECT SUM(oi.quantity * oi.unit_price)
    FROM order_item oi
    WHERE oi.order_id = o.order_id
), 0);

-- UPDATE ... FROM: reserve stock for OUTBOUND shipments that are still in
-- the warehouse (CREATED or PACKED). Stock for shipments that already left
-- has been deducted from quantity, so it is not reserved any more.
UPDATE inventory i
SET reserved_quantity = r.reserved
FROM (
    SELECT s.warehouse_id, oi.product_id, SUM(oi.quantity) AS reserved
    FROM shipment s
    JOIN order_item oi ON oi.order_id = s.order_id
    WHERE s.shipment_type = 'OUTBOUND'
      AND s.status IN ('CREATED', 'PACKED')
    GROUP BY s.warehouse_id, oi.product_id
) r
WHERE i.warehouse_id = r.warehouse_id
  AND i.product_id   = r.product_id;

-- UPDATE: a supplier gets suspended after repeated late deliveries
UPDATE producer
SET status = 'SUSPENDED'
WHERE producer_id = 6;

-- DELETE: Orbit Display Systems stops supplying the Samsung Odyssey G5
DELETE FROM producer_product
WHERE producer_id = 4
  AND product_id  = 107;


-- -----------------------------------------------------------------------------
-- Move identity sequences past the explicit IDs used above, so the next row
-- the app inserts gets a fresh ID instead of a duplicate-key error.
-- -----------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('organization',   'organization_id'), (SELECT MAX(organization_id) FROM organization));
SELECT setval(pg_get_serial_sequence('producer',       'producer_id'),     (SELECT MAX(producer_id)     FROM producer));
SELECT setval(pg_get_serial_sequence('product',        'product_id'),      (SELECT MAX(product_id)      FROM product));
SELECT setval(pg_get_serial_sequence('warehouse',      'warehouse_id'),    (SELECT MAX(warehouse_id)    FROM warehouse));
SELECT setval(pg_get_serial_sequence('customer',       'customer_id'),     (SELECT MAX(customer_id)     FROM customer));
SELECT setval(pg_get_serial_sequence('transport',      'transport_id'),    (SELECT MAX(transport_id)    FROM transport));
SELECT setval(pg_get_serial_sequence('customer_order', 'order_id'),        (SELECT MAX(order_id)        FROM customer_order));
SELECT setval(pg_get_serial_sequence('shipment',       'shipment_id'),     (SELECT MAX(shipment_id)     FROM shipment));
-- inventory and order_item used generated IDs, nothing to move

COMMIT;
