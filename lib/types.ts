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

/** GET /api/products/[id] */
export interface ProductDetail extends Product {
  inventory: WarehouseStock[];
}
