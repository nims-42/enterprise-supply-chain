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
