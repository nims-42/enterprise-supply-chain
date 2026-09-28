"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import { receiveStockSchema, transferStockSchema } from "@/lib/validation/inventory";
import type { ProductListResponse, WarehouseSummary } from "@/lib/types";

// Two small forms used on the Inventory page and on a warehouse's page:
//   ReceiveStockForm   goods arrive  -> POST /api/inventory/receive
//   TransferStockForm  move stock    -> POST /api/inventory/transfer
// Both run as a single transaction on the server.

interface Option {
  id: number;
  label: string;
}

/**
 * Loads the product and warehouse lists the dropdowns need. Reloads when
 * refreshKey changes, so the "free" space shown per warehouse stays current.
 */
function useOptions(refreshKey: number) {
  const [products, setProducts] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);

  useEffect(() => {
    apiFetch<ProductListResponse>("/api/products?limit=100")
      .then((res) =>
        setProducts(res.data.map((p) => ({ id: p.product_id, label: `${p.name} (${p.sku})` }))),
      )
      .catch(() => {});
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then((res) =>
        setWarehouses(
          res.map((w) => ({
            id: w.warehouse_id,
            label: `${w.name} (${w.capacity - w.units_held} free)`,
          })),
        ),
      )
      .catch(() => {});
  }, [refreshKey]);

  return { products, warehouses };
}

const num = (text: string) => (text.trim() === "" ? undefined : Number(text));

const selectClass =
  "mt-1 block w-60 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const inputClass = "mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const labelClass = "text-xs font-medium text-slate-600";
const buttonClass =
  "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

function Message({ error, success }: { error: string | null; success: string | null }) {
  if (error) return <p className="mt-3 text-sm text-red-700">{error}</p>;
  if (success) return <p className="mt-3 text-sm text-emerald-700">{success}</p>;
  return null;
}

export function ReceiveStockForm({
  fixedWarehouseId,
  refreshKey,
  onDone,
}: {
  /** On a warehouse's own page the warehouse is already known. */
  fixedWarehouseId?: number;
  /** Change this after stock moves to reload the dropdown lists. */
  refreshKey: number;
  onDone: () => void;
}) {
  const { products, warehouses } = useOptions(refreshKey);
  const [warehouseId, setWarehouseId] = useState(fixedWarehouseId ? String(fixedWarehouseId) : "");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = receiveStockSchema.safeParse({
      warehouse_id: num(warehouseId),
      product_id: num(productId),
      quantity: num(quantity),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);

    setBusy(true);
    try {
      await apiFetch("/api/inventory/receive", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      const product = products.find((p) => p.id === parsed.data.product_id)?.label ?? "stock";
      setSuccess(`Received ${parsed.data.quantity} x ${product}.`);
      setQuantity("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        {!fixedWarehouseId && (
          <label className={labelClass}>
            Warehouse
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={selectClass}
            >
              <option value="">Choose...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={labelClass}>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={selectClass}>
            <option value="">Choose...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Quantity
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Saving..." : "Receive"}
        </button>
      </div>
      <Message error={error} success={success} />
    </form>
  );
}

export function TransferStockForm({
  refreshKey,
  onDone,
}: {
  refreshKey: number;
  onDone: () => void;
}) {
  const { products, warehouses } = useOptions(refreshKey);
  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = transferStockSchema.safeParse({
      product_id: num(productId),
      from_warehouse_id: num(fromId),
      to_warehouse_id: num(toId),
      quantity: num(quantity),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);

    setBusy(true);
    try {
      await apiFetch("/api/inventory/transfer", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setSuccess(`Transferred ${parsed.data.quantity} units.`);
      setQuantity("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={selectClass}>
            <option value="">Choose...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          From
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
            <option value="">Choose...</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          To
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectClass}>
            <option value="">Choose...</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Quantity
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Saving..." : "Transfer"}
        </button>
      </div>
      <Message error={error} success={success} />
    </form>
  );
}
