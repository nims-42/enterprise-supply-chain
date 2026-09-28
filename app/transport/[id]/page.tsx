"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import type { TransportDetail } from "@/lib/types";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import TransportStatusBadge from "@/components/TransportStatusBadge";

interface LoadResult {
  id: string;
  vehicle?: TransportDetail;
  error?: string;
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");

export default function TransportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<TransportDetail>(`/api/transport/${id}`, { signal: controller.signal })
      .then((vehicle) => setResult({ id, vehicle }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the vehicle.",
        });
      });
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/transport/${id}`, { method: "DELETE" });
      router.push("/transport");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.vehicle) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/transport" className="mt-4 inline-block text-sm underline">
          Back to transport
        </Link>
      </div>
    );
  }

  const v = result.vehicle;

  return (
    <div className="max-w-5xl">
      <Link href="/transport" className="text-sm text-slate-500 hover:underline">
        &larr; Transport
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{v.vehicle_number}</h1>
          <TransportStatusBadge status={v.status} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/transport/${v.transport_id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Edit
          </Link>
          {confirmingDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <div>
          <dt className="text-slate-500">Type</dt>
          <dd className="mt-1 font-medium">{titleCase(v.transport_type)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Carrier</dt>
          <dd className="mt-1 font-medium">{v.carrier_name ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Capacity</dt>
          <dd className="mt-1 font-medium tabular-nums">{v.capacity.toLocaleString("en-IN")} kg</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Shipments carried</h2>
      {v.shipments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No shipments yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Shipment</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Customer / producer</th>
                <th className="px-4 py-3">Dispatched</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {v.shipments.map((s) => (
                <tr key={s.shipment_id}>
                  <td className="px-4 py-3">
                    <Link href={`/shipments/${s.shipment_id}`} className="font-medium hover:underline">
                      #{s.shipment_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.shipment_type === "INBOUND" ? "Inbound" : "Outbound"}</td>
                  <td className="px-4 py-3">{s.warehouse}</td>
                  <td className="px-4 py-3">{s.counterparty}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.shipment_date ? formatDate(s.shipment_date) : "-"}
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
