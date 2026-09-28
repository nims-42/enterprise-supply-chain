"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import type { OrderDetail, WarehouseSummary } from "@/lib/types";
import OrderStatusBadge from "@/components/OrderStatusBadge";

interface LoadResult {
  id: string;
  order?: OrderDetail;
  error?: string;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [version, setVersion] = useState(0);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<OrderDetail>(`/api/orders/${id}`, { signal: controller.signal })
      .then((order) => setResult({ id, order }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the order.",
        });
      });
    return () => controller.abort();
  }, [id, version]);

  useEffect(() => {
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then(setWarehouses)
      .catch(() => {});
  }, []);

  async function act(path: "confirm" | "cancel", body?: object) {
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/api/orders/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setConfirmingCancel(false);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.order) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/orders" className="mt-4 inline-block text-sm underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const o = result.order;
  const canCancel = o.status === "PENDING" || o.status === "CONFIRMED";

  return (
    <div className="max-w-5xl">
      <Link href="/orders" className="text-sm text-slate-500 hover:underline">
        &larr; Orders
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Order #{o.order_id}</h1>
          <OrderStatusBadge status={o.status} />
        </div>
        {canCancel && (
          <div className="flex shrink-0 gap-2">
            {confirmingCancel ? (
              <>
                <button
                  onClick={() => act("cancel")}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Cancelling..." : "Yes, cancel order"}
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel order
              </button>
            )}
          </div>
        )}
      </div>

      {confirmingCancel && o.status === "CONFIRMED" && (
        <p className="mt-3 text-sm text-amber-800">
          The reserved stock goes back to available and the shipment is cancelled.
        </p>
      )}

      {actionError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Customer</dt>
          <dd className="mt-1 font-medium">
            <Link href={`/customers/${o.customer_id}`} className="hover:underline">
              {o.customer_name}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Placed</dt>
          <dd className="mt-1 font-medium">{formatDateTime(o.order_date)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected</dt>
          <dd className="mt-1 font-medium">{o.expected_date ? formatDate(o.expected_date) : "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Total</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{formatINR(o.total_amount)}</dd>
        </div>
      </dl>

      {o.status === "PENDING" && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-medium">Confirm this order</p>
          <p className="text-xs text-slate-500">
            Reserves every line in one warehouse and creates the outbound shipment. If any product
            is short there, nothing changes.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Choose a warehouse...</option>
              {warehouses.map((w) => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => act("confirm", { warehouse_id: Number(warehouseId) })}
              disabled={busy || !warehouseId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Reserving..." : "Reserve and confirm"}
            </button>
          </div>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Items</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {o.items.map((item) => (
              <tr key={item.order_item_id}>
                <td className="px-4 py-3">
                  <Link href={`/products/${item.product_id}`} className="font-medium hover:underline">
                    {item.product}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{item.sku}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.unit_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-4 py-3 text-right font-medium">
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {formatINR(o.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Unit prices were copied from the catalogue when the order was placed, so later price
        changes don&apos;t alter this order.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Shipments</h2>
      {o.shipments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          None yet. A shipment is created when the order is confirmed.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Shipment</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Dispatched</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {o.shipments.map((s) => (
                <tr key={s.shipment_id}>
                  <td className="px-4 py-3 font-medium">#{s.shipment_id}</td>
                  <td className="px-4 py-3">
                    <Link href={`/warehouses/${s.warehouse_id}`} className="hover:underline">
                      {s.warehouse}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.vehicle_number ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.shipment_date ? formatDate(s.shipment_date) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.expected_delivery ? formatDate(s.expected_delivery) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.actual_delivery ? formatDate(s.actual_delivery) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
