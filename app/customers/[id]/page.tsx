"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate, formatINR } from "@/lib/format";
import type { CustomerDetail } from "@/lib/types";
import OrderStatusBadge from "@/components/OrderStatusBadge";

interface LoadResult {
  id: string;
  customer?: CustomerDetail;
  error?: string;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<CustomerDetail>(`/api/customers/${id}`, { signal: controller.signal })
      .then((customer) => setResult({ id, customer }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the customer.",
        });
      });
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      router.push("/customers");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.customer) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/customers" className="mt-4 inline-block text-sm underline">
          Back to customers
        </Link>
      </div>
    );
  }

  const c = result.customer;

  return (
    <div className="max-w-5xl">
      <Link href="/customers" className="text-sm text-slate-500 hover:underline">
        &larr; Customers
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/orders/new?customer=${c.customer_id}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New order
          </Link>
          <Link
            href={`/customers/${c.customer_id}/edit`}
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

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="mt-1 font-medium">{c.email ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Phone</dt>
          <dd className="mt-1 font-medium">{c.phone ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Customer since</dt>
          <dd className="mt-1 font-medium">{formatDate(c.created_at)}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-slate-500">Address</dt>
          <dd className="mt-1">{c.address ?? "-"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Orders</h2>
      {c.orders.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No orders yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Placed</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.orders.map((o) => (
                <tr key={o.order_id}>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.order_id}`} className="font-medium hover:underline">
                      #{o.order_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(o.order_date)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.expected_date ? formatDate(o.expected_date) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.item_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(o.total_amount)}</td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
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
