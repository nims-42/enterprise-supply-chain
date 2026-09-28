"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatINR } from "@/lib/format";
import { orderCreateSchema } from "@/lib/validation/order";
import type {
  CustomerListResponse,
  ProductListResponse,
  WarehouseDetail,
  WarehouseSummary,
} from "@/lib/types";

interface Line {
  key: number;
  productId: string;
  quantity: string;
}

interface ProductOption {
  product_id: number;
  name: string;
  sku: string;
  unit_price: number;
}

let nextLineKey = 1;
const newLine = (): Line => ({ key: nextLineKey++, productId: "", quantity: "1" });

// Today's date in India as YYYY-MM-DD, for the date picker's minimum.
const todayInIndia = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// useSearchParams (for ?customer=3 coming from a customer's page) needs a
// Suspense boundary in Next 16, so the form lives in its own component.
export default function NewOrderPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
      <NewOrderForm />
    </Suspense>
  );
}

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<{ customer_id: number; name: string }[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);

  const [customerId, setCustomerId] = useState(searchParams.get("customer") ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);

  // Stock at the chosen warehouse: product_id -> available units. Kept with
  // the warehouse it belongs to, so switching warehouse never shows stale data.
  const [stock, setStock] = useState<{ warehouseId: string; available: Map<number, number> }>();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<CustomerListResponse>("/api/customers?limit=100")
      .then((res) => setCustomers(res.data))
      .catch(() => setError("Could not load customers."));
    apiFetch<ProductListResponse>("/api/products?limit=100")
      .then((res) => setProducts(res.data))
      .catch(() => setError("Could not load products."));
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then(setWarehouses)
      .catch(() => setError("Could not load warehouses."));
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    const controller = new AbortController();
    apiFetch<WarehouseDetail>(`/api/warehouses/${warehouseId}`, { signal: controller.signal })
      .then((w) =>
        setStock({
          warehouseId,
          available: new Map(w.inventory.map((row) => [row.product_id, row.available])),
        }),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [warehouseId]);

  const available = warehouseId && stock?.warehouseId === warehouseId ? stock.available : null;
  const productById = new Map(products.map((p) => [p.product_id, p]));

  const total = lines.reduce((sum, line) => {
    const product = productById.get(Number(line.productId));
    const qty = Number(line.quantity);
    return product && qty > 0 ? sum + product.unit_price * qty : sum;
  }, 0);

  function updateLine(key: number, change: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Same schema as the API; the server checks again (and checks stock).
    const parsed = orderCreateSchema.safeParse({
      customer_id: customerId ? Number(customerId) : undefined,
      expected_date: expectedDate || null,
      warehouse_id: warehouseId ? Number(warehouseId) : null,
      items: lines
        .filter((l) => l.productId !== "")
        .map((l) => ({
          product_id: Number(l.productId),
          quantity: l.quantity.trim() === "" ? undefined : Number(l.quantity),
        })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSaving(true);
    try {
      const created = await apiFetch<{ order_id: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      router.push(`/orders/${created.order_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
      setSaving(false);
    }
  }

  const fieldClass =
    "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="max-w-4xl">
      <Link href="/orders" className="text-sm text-slate-500 hover:underline">
        &larr; Orders
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New order</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Customer *
            <select
              className={fieldClass}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Choose...</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Expected delivery
            <input
              type="date"
              className={fieldClass}
              value={expectedDate}
              min={todayInIndia()}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Reserve stock from
            <select
              className={fieldClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Don&apos;t reserve yet (Pending)</option>
              {warehouses.map((w) => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                {available && <th className="px-4 py-3 text-right">Available</th>}
                <th className="px-4 py-3 text-right">Line total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => {
                const product = productById.get(Number(line.productId));
                const qty = Number(line.quantity);
                const avail = product && available ? (available.get(product.product_id) ?? 0) : null;
                const short = avail !== null && qty > avail;
                // Don't offer a product that another line already uses.
                const usedElsewhere = new Set(
                  lines.filter((l) => l.key !== line.key).map((l) => l.productId),
                );
                return (
                  <tr key={line.key}>
                    <td className="px-4 py-2">
                      <select
                        value={line.productId}
                        onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                        className="w-72 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Choose a product...</option>
                        {products
                          .filter((p) => !usedElsewhere.has(String(p.product_id)))
                          .map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {product ? formatINR(product.unit_price) : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className={`w-20 rounded border px-2 py-1 text-right text-sm ${
                          short ? "border-red-400" : "border-slate-300"
                        }`}
                      />
                    </td>
                    {available && (
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${short ? "font-medium text-red-600" : "text-slate-600"}`}
                      >
                        {avail ?? "-"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums">
                      {product && qty > 0 ? formatINR(product.unit_price * qty) : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                          className="text-sm text-slate-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setLines((c) => [...c, newLine()])}
              className="text-sm font-medium text-slate-700 hover:underline"
            >
              + Add product
            </button>
            <p className="text-sm">
              Total <span className="ml-2 text-lg font-semibold tabular-nums">{formatINR(total)}</span>
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {warehouseId
            ? "Placing the order reserves this stock and creates its shipment in one transaction. If any product is short, nothing is saved."
            : "The order is saved as Pending with no stock reserved. You can confirm it from a warehouse later."}
        </p>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Placing order..." : "Place order"}
          </button>
          <Link
            href="/orders"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
