"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { TRANSPORT_STATUSES } from "@/lib/validation/transport";
import type { TransportListItem } from "@/lib/types";
import TransportStatusBadge from "@/components/TransportStatusBadge";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");

export default function TransportPage() {
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{
    key: string;
    data?: TransportListItem[];
    error?: string;
  } | null>(null);

  const loading = result?.key !== status;

  useEffect(() => {
    const key = status;
    const controller = new AbortController();
    apiFetch<TransportListItem[]>(`/api/transport${status ? `?status=${status}` : ""}`, {
      signal: controller.signal,
    })
      .then((data) => setResult({ key, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Could not load vehicles.",
        });
      });
    return () => controller.abort();
  }, [status]);

  const data = result?.data;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transport</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.length} vehicle${data.length === 1 ? "" : "s"}` : " "}
          </p>
        </div>
        <Link
          href="/transport/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New vehicle
        </Link>
      </div>

      <div className="mt-6">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {TRANSPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
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
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3 text-right">Capacity (kg)</th>
              <th className="px-4 py-3 text-right">Trips</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Current shipment</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
            {data?.map((t) => (
              <tr key={t.transport_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/transport/${t.transport_id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {t.vehicle_number}
                  </Link>
                </td>
                <td className="px-4 py-3">{titleCase(t.transport_type)}</td>
                <td className="px-4 py-3 text-slate-600">{t.carrier_name ?? "-"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {t.capacity.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{t.completed_trips}</td>
                <td className="px-4 py-3">
                  <TransportStatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3">
                  {t.current_shipment_id ? (
                    <Link href={`/shipments/${t.current_shipment_id}`} className="hover:underline">
                      #{t.current_shipment_id}
                    </Link>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No vehicles match.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
