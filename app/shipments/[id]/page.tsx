"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ShipmentDetail } from "@/lib/types";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import ShipmentActions from "@/components/ShipmentActions";

interface LoadResult {
  id: string;
  shipment?: ShipmentDetail;
  error?: string;
}

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ShipmentDetail>(`/api/shipments/${id}`, { signal: controller.signal })
      .then((shipment) => setResult({ id, shipment }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the shipment.",
        });
      });
    return () => controller.abort();
  }, [id, version]);

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.shipment) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/shipments" className="mt-4 inline-block text-sm underline">
          Back to shipments
        </Link>
      </div>
    );
  }

  const s = result.shipment;
  const outbound = s.shipment_type === "OUTBOUND";

  const counterparty = outbound ? (
    <Link href={`/customers/${s.customer_id}`} className="hover:underline">
      {s.counterparty}
    </Link>
  ) : (
    <Link href={`/producers/${s.producer_id}`} className="hover:underline">
      {s.counterparty}
    </Link>
  );
  const warehouse = (
    <Link href={`/warehouses/${s.warehouse_id}`} className="hover:underline">
      {s.warehouse}
    </Link>
  );

  return (
    <div className="max-w-5xl">
      <Link href="/shipments" className="text-sm text-slate-500 hover:underline">
        &larr; Shipments
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Shipment #{s.shipment_id}</h1>
        <OrderStatusBadge status={s.status} />
        {s.overdue && (
          <span className="text-sm font-medium text-red-600">
            overdue by {s.days_late} day{s.days_late === 1 ? "" : "s"}
          </span>
        )}
        {!s.overdue && s.status === "DELIVERED" && !!s.days_late && (
          <span className="text-sm text-amber-700">
            arrived {s.days_late} day{s.days_late === 1 ? "" : "s"} late
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {outbound ? (
          <>
            Outbound: {warehouse} &rarr; {counterparty}, for{" "}
            <Link href={`/orders/${s.order_id}`} className="hover:underline">
              order #{s.order_id}
            </Link>
            {s.order_status && <> (order is {s.order_status.toLowerCase()})</>}
          </>
        ) : (
          <>
            Inbound: {counterparty} &rarr; {warehouse}
          </>
        )}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Vehicle</dt>
          <dd className="mt-1 font-mono font-medium">
            {s.transport_id ? (
              <Link href={`/transport/${s.transport_id}`} className="hover:underline">
                {s.vehicle_number}
              </Link>
            ) : outbound ? (
              "-"
            ) : (
              <span className="font-sans text-slate-500">producer&apos;s own</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Dispatched</dt>
          <dd className="mt-1 font-medium">
            {s.shipment_date ? formatDateTime(s.shipment_date) : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Expected</dt>
          <dd className={`mt-1 font-medium ${s.overdue ? "text-red-600" : ""}`}>
            {s.expected_delivery ? formatDate(s.expected_delivery) : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Delivered</dt>
          <dd className="mt-1 font-medium">
            {s.actual_delivery ? formatDateTime(s.actual_delivery) : "-"}
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Next step</h2>
      <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <ShipmentActions shipment={s} onChanged={() => setVersion((v) => v + 1)} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">Contents</h2>
      {outbound ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.items.map((item) => (
                <tr key={item.product_id}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${item.product_id}`} className="font-medium hover:underline">
                      {item.product}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{item.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          The database doesn&apos;t store what an inbound shipment carries. What arrives is
          entered when it is marked delivered and goes straight into the warehouse&apos;s stock.
        </p>
      )}
    </div>
  );
}
