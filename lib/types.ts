// Shapes of the JSON the API returns. Kept in one place so pages and
// components agree on field names (which match the database columns).

export interface Product {
  product_id: number;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  unit_price: number;
  reorder_level: number;
  created_at: string;
}

/** A row from GET /api/products (includes stock totals across warehouses). */
export interface ProductListItem extends Product {
  total_quantity: number;
  total_available: number;
}

export interface ProductListResponse {
  data: ProductListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface WarehouseStock {
  warehouse_id: number;
  warehouse: string;
  quantity: number;
  reserved_quantity: number;
  available: number;
  last_updated: string;
}

export type ProducerStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

/** One supplier of a product (product detail page). */
export interface ProductSupplier {
  producer_id: number;
  name: string;
  status: ProducerStatus;
  supply_price: number;
  lead_time_days: number;
  minimum_order_quantity: number;
}

/** GET /api/products/[id] */
export interface ProductDetail extends Product {
  inventory: WarehouseStock[];
  suppliers: ProductSupplier[];
}

export interface Producer {
  producer_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: ProducerStatus;
  created_at: string;
}

/** A row from GET /api/producers */
export interface ProducerListItem extends Producer {
  product_count: number;
}

export interface ProducerListResponse {
  data: ProducerListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** One product a producer supplies (producer detail page). */
export interface SuppliedProduct {
  product_id: number;
  name: string;
  sku: string;
  category: string | null;
  unit_price: number;
  supply_price: number;
  lead_time_days: number;
  minimum_order_quantity: number;
  margin: number;
}

/** GET /api/producers/[id] */
export interface ProducerDetail extends Producer {
  products: SuppliedProduct[];
}

export interface Warehouse {
  warehouse_id: number;
  name: string;
  location: string;
  capacity: number;
  created_at: string;
}

/** A row from GET /api/warehouses */
export interface WarehouseSummary extends Warehouse {
  product_count: number;
  units_held: number;
  units_reserved: number;
  low_stock_count: number;
}

/** From the inventory_status view. */
export type StockStatus = "OUT_OF_STOCK" | "FULLY_RESERVED" | "LOW_STOCK" | "IN_STOCK";

/** One stock row: a product in a warehouse. */
export interface InventoryRow {
  inventory_id: number;
  warehouse_id: number;
  warehouse: string;
  product_id: number;
  product: string;
  sku: string;
  reorder_level: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
  stock_status: StockStatus;
  last_updated: string;
}

export interface InventoryListResponse {
  data: InventoryRow[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /api/warehouses/[id] */
export interface WarehouseDetail extends Warehouse {
  inventory: InventoryRow[];
}

export interface Customer {
  customer_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

/** A row from GET /api/customers */
export interface CustomerListItem extends Customer {
  order_count: number;
  open_orders: number;
  total_spent: number;
  last_order_date: string | null;
}

export interface CustomerListResponse {
  data: CustomerListItem[];
  total: number;
  limit: number;
  offset: number;
}

export type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";

/** An order as listed under a customer. */
export interface CustomerOrderSummary {
  order_id: number;
  order_date: string;
  expected_date: string | null;
  status: OrderStatus;
  total_amount: number;
  item_count: number;
}

/** GET /api/customers/[id] */
export interface CustomerDetail extends Customer {
  orders: CustomerOrderSummary[];
}

/** A row from GET /api/orders */
export interface OrderListItem extends CustomerOrderSummary {
  customer_id: number;
  customer_name: string;
}

export interface OrderListResponse {
  data: OrderListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrderLine {
  order_item_id: number;
  product_id: number;
  product: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export type ShipmentStatus =
  | "CREATED"
  | "PACKED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "DELAYED"
  | "CANCELLED";

/** A shipment as shown on an order. */
export interface OrderShipment {
  shipment_id: number;
  warehouse_id: number;
  warehouse: string;
  status: ShipmentStatus;
  shipment_date: string | null;
  expected_delivery: string | null;
  actual_delivery: string | null;
  vehicle_number: string | null;
}

/** GET /api/orders/[id] */
export interface OrderDetail {
  order_id: number;
  customer_id: number;
  customer_name: string;
  order_date: string;
  expected_date: string | null;
  status: OrderStatus;
  total_amount: number;
  items: OrderLine[];
  shipments: OrderShipment[];
}

export type TransportType = "TRUCK" | "VAN" | "BIKE" | "RAIL" | "AIR" | "SHIP";
export type TransportStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "INACTIVE";

export interface Transport {
  transport_id: number;
  vehicle_number: string;
  transport_type: TransportType;
  carrier_name: string | null;
  capacity: number;
  status: TransportStatus;
}

/** A row from GET /api/transport */
export interface TransportListItem extends Transport {
  current_shipment_id: number | null;
  completed_trips: number;
}

export type ShipmentType = "INBOUND" | "OUTBOUND";

/** One trip in a vehicle's history. */
export interface TransportTrip {
  shipment_id: number;
  shipment_type: ShipmentType;
  status: ShipmentStatus;
  shipment_date: string | null;
  expected_delivery: string | null;
  actual_delivery: string | null;
  warehouse: string;
  counterparty: string;
}

/** GET /api/transport/[id] */
export interface TransportDetail extends Transport {
  shipments: TransportTrip[];
}

/** A row from GET /api/shipments */
export interface ShipmentListItem {
  shipment_id: number;
  shipment_type: ShipmentType;
  status: ShipmentStatus;
  warehouse_id: number;
  warehouse: string;
  order_id: number | null;
  producer_id: number | null;
  counterparty: string;
  vehicle_number: string | null;
  shipment_date: string | null;
  expected_delivery: string | null;
  actual_delivery: string | null;
  overdue: boolean;
  /** Days past expected_delivery (how late it arrived, or is so far). */
  days_late: number | null;
}

export interface ShipmentListResponse {
  data: ShipmentListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** A product line on a shipment detail page. */
export interface ShipmentLine {
  product_id: number;
  product: string;
  sku: string;
  quantity: number;
}

/** A product the shipment's producer supplies (for receiving inbound goods). */
export interface ReceivableProduct {
  product_id: number;
  product: string;
  sku: string;
  minimum_order_quantity: number;
}

/** GET /api/shipments/[id] */
export interface ShipmentDetail extends ShipmentListItem {
  transport_id: number | null;
  customer_id: number | null;
  order_status: OrderStatus | null;
  /** OUTBOUND: the order's lines. INBOUND: empty (what arrived isn't stored). */
  items: ShipmentLine[];
  /** INBOUND only: what this producer can deliver. */
  receivable_products: ReceivableProduct[];
  /** Statuses this shipment may move to next. */
  next_statuses: ShipmentStatus[];
}
