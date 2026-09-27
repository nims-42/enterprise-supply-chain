"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDateTime, formatINR } from "@/lib/format";
import type { ProductDetail } from "@/lib/types";
import StockBadge from "@/components/StockBadge";
import ProducerStatusBadge from "@/components/ProducerStatusBadge";

interface LoadResult {
  id: string;
  product?: ProductDetail;
  error?: string;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ProductDetail>(`/api/products/${id}`, { signal: controller.signal })
      .then((product) => setResult({ id, product }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the product.",
        });
      });
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      router.push("/products");
    } catch (err) {
      // e.g. 409 when the product still has stock or appears in orders
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (!result || result.id !== id) {
    return <p className="text-slate-500">Loading...</p>;
  }

  if (result.error || !result.product) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/products" className="mt-4 inline-block text-sm underline">
          Back to products
        </Link>
      </div>
    );
  }

  const p = result.product;
  const totalQuantity = p.inventory.reduce((sum, row) => sum + row.quantity, 0);
  const totalAvailable = p.inventory.reduce((sum, row) => sum + row.available, 0);

  return (
    <div className="max-w-4xl">
      <Link href="/products" className="text-sm text-slate-500 hover:underline">
        &larr; Products
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="mt-1 font-mono text-sm text-slate-500">{p.sku}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/products/${p.product_id}/edit`}
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

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Category</dt>
          <dd className="mt-1 font-medium">{p.category ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Unit price</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatINR(p.unit_price)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Reorder level</dt>
          <dd className="mt-1 font-medium tabular-nums">{p.reorder_level}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Stock</dt>
          <dd className="mt-1">
            <StockBadge
              quantity={totalQuantity}
              available={totalAvailable}
              reorderLevel={p.reorder_level}
            />
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-slate-500">Description</dt>
          <dd className="mt-1 whitespace-pre-line">{p.description ?? "-"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Stock by warehouse</h2>
      {p.inventory.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Not stocked in any warehouse yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Reserved</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.inventory.map((row) => (
                <tr key={row.warehouse_id}>
                  <td className="px-4 py-3 font-medium">{row.warehouse}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.reserved_quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.available}</td>
                  <td className="px-4 py-3">
                    <StockBadge
                      quantity={row.quantity}
                      available={row.available}
                      reorderLevel={p.reorder_level}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(row.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Suppliers</h2>
      {p.suppliers.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No producer supplies this product yet. Add it from a producer&apos;s page.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Producer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Supply price</th>
                <th className="px-4 py-3 text-right">Lead time (days)</th>
                <th className="px-4 py-3 text-right">Min. order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.suppliers.map((s, index) => (
                <tr key={s.producer_id}>
                  <td className="px-4 py-3">
                    <Link href={`/producers/${s.producer_id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {/* The API sorts active suppliers first, cheapest first */}
                    {index === 0 && s.status === "ACTIVE" && (
                      <span className="ml-2 text-xs text-emerald-700">best price</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ProducerStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(s.supply_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.lead_time_days}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.minimum_order_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
