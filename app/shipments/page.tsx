"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { SHIPMENT_STATUSES } from "@/lib/validation/shipment";
import type { ShipmentListResponse, WarehouseSummary } from "@/lib/types";
import OrderStatusBadge from "@/components/OrderStatusBadge";

const PAGE_SIZE = 25;

interface LoadResult {
  key: string;
  data?: ShipmentListResponse;
  error?: string;
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");

export default function ShipmentsPage() {
  const [direction, setDirection] = useState<"" | "OUTBOUND" | "INBOUND">("");
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
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

  const requestKey = [direction, status, warehouseId, overdueOnly, debouncedSearch, page].join("|");
  const loading = result?.key !== requestKey;

  useEffect(() => {
    const key = [direction, status, warehouseId, overdueOnly, debouncedSearch, page].join("|");
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (direction) params.set("type", direction);
    if (status) params.set("status", status);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (overdueOnly) params.set("overdue", "true");
    if (debouncedSearch) params.set("q", debouncedSearch);

    const controller = new AbortController();
    apiFetch<ShipmentListResponse>(`/api/shipments?${params}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Could not load shipments.",
        });
      });
    return () => controller.abort();
  }, [direction, status, warehouseId, overdueOnly, debouncedSearch, page]);

  const data = result?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const tab = (value: "" | "OUTBOUND" | "INBOUND", label: string) => (
    <button
      onClick={() => {
        setDirection(value);
        setPage(0);
      }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        direction === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Shipments</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} shipment${data.total === 1 ? "" : "s"}` : " "}
          </p>
        </div>
        <Link
          href="/shipments/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Book inbound delivery
        </Link>
      </div>

      <div className="mt-6 flex gap-1">
        {tab("", "All")}
        {tab("OUTBOUND", "Outbound (to customers)")}
        {tab("INBOUND", "Inbound (from producers)")}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Shipment number, customer or producer"
          className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
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
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(0);
            }}
          />
          Overdue only
        </label>
      </div>

      {result?.error && !loading && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Shipment</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Expected</th>
              <th className="px-4 py-3">Delivered</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
            {data?.data.map((s) => (
              <tr key={s.shipment_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/shipments/${s.shipment_id}`} className="font-medium hover:underline">
                    #{s.shipment_id}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {s.shipment_type === "OUTBOUND" ? `Outbound, order #${s.order_id}` : "Inbound"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {s.shipment_type === "OUTBOUND" ? (
                    <>
                      {s.warehouse} <span className="text-slate-400">&rarr;</span> {s.counterparty}
                    </>
                  ) : (
                    <>
                      {s.counterparty} <span className="text-slate-400">&rarr;</span> {s.warehouse}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{s.vehicle_number ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.expected_delivery ? formatDate(s.expected_delivery) : "-"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {s.actual_delivery ? formatDate(s.actual_delivery) : "-"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <OrderStatusBadge status={s.status} />
                  {s.overdue ? (
                    <span className="ml-2 text-xs font-medium text-red-600">
                      overdue{s.days_late ? ` ${s.days_late}d` : ""}
                    </span>
                  ) : s.status === "DELIVERED" && s.days_late ? (
                    <span className="ml-2 text-xs text-amber-700">{s.days_late}d late</span>
                  ) : null}
                </td>
              </tr>
            ))}
            {data && data.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No shipments match.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
