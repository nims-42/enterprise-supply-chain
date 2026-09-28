"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { InventoryListResponse, WarehouseSummary } from "@/lib/types";
import InventoryTable from "@/components/InventoryTable";
import { ReceiveStockForm, TransferStockForm } from "@/components/StockMovementForms";

const PAGE_SIZE = 25;

interface LoadResult {
  key: string;
  data?: InventoryListResponse;
  error?: string;
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [panel, setPanel] = useState<"receive" | "transfer" | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then(setWarehouses)
      .catch(() => {});
  }, []);

  const requestKey = `${debouncedSearch}|${warehouseId}|${lowStockOnly}|${page}|${version}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    const key = `${debouncedSearch}|${warehouseId}|${lowStockOnly}|${page}|${version}`;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (lowStockOnly) params.set("low_stock", "true");

    const controller = new AbortController();
    apiFetch<InventoryListResponse>(`/api/inventory?${params}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Could not load inventory.",
        });
      });
    return () => controller.abort();
  }, [debouncedSearch, warehouseId, lowStockOnly, page, version]);

  const data = result?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const reload = () => setVersion((v) => v + 1);

  const panelButton = (name: "receive" | "transfer", label: string) => (
    <button
      onClick={() => setPanel(panel === name ? null : name)}
      className={`rounded-md px-4 py-2 text-sm font-medium ${
        panel === name
          ? "bg-slate-900 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} stock record${data.total === 1 ? "" : "s"}` : " "}
          </p>
        </div>
        <div className="flex gap-2">
          {panelButton("receive", "Receive stock")}
          {panelButton("transfer", "Transfer stock")}
        </div>
      </div>

      {panel && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          {panel === "receive" ? (
            <ReceiveStockForm refreshKey={version} onDone={reload} />
          ) : (
            <TransferStockForm refreshKey={version} onDone={reload} />
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or SKU"
          className="w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.warehouse_id} value={w.warehouse_id}>
              {w.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              setPage(0);
            }}
          />
          Low stock only
        </label>
      </div>

      {result?.error && !loading && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div className={`mt-6 ${loading && data ? "opacity-50" : ""}`}>
        {data ? (
          <InventoryTable
            rows={data.data}
            showWarehouse
            onChanged={reload}
            emptyText="No stock records match."
          />
        ) : (
          !result?.error && <p className="text-slate-500">Loading...</p>
        )}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0 || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
