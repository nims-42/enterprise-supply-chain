"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { ProducerDetail } from "@/lib/types";
import ProducerStatusBadge from "@/components/ProducerStatusBadge";
import SuppliedProducts from "@/components/SuppliedProducts";

interface LoadResult {
  id: string;
  producer?: ProducerDetail;
  error?: string;
}

export default function ProducerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);
  // Bumped after a supply change to re-fetch the producer.
  const [version, setVersion] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ProducerDetail>(`/api/producers/${id}`, { signal: controller.signal })
      .then((producer) => setResult({ id, producer }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the producer.",
        });
      });
    return () => controller.abort();
  }, [id, version]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/producers/${id}`, { method: "DELETE" });
      router.push("/producers");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.producer) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/producers" className="mt-4 inline-block text-sm underline">
          Back to producers
        </Link>
      </div>
    );
  }

  const p = result.producer;

  return (
    <div className="max-w-5xl">
      <Link href="/producers" className="text-sm text-slate-500 hover:underline">
        &larr; Producers
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <ProducerStatusBadge status={p.status} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/producers/${p.producer_id}/edit`}
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

      {confirmingDelete && p.products.length > 0 && (
        <p className="mt-3 text-sm text-amber-800">
          Deleting also removes this producer&apos;s {p.products.length} supply link
          {p.products.length === 1 ? "" : "s"}. To keep the history, edit the producer and set
          it to Inactive instead.
        </p>
      )}

      {deleteError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="mt-1 font-medium">{p.email ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Phone</dt>
          <dd className="mt-1 font-medium">{p.phone ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Supplier since</dt>
          <dd className="mt-1 font-medium">{formatDateTime(p.created_at)}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-slate-500">Address</dt>
          <dd className="mt-1">{p.address ?? "-"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Products supplied</h2>
      <p className="text-sm text-slate-500">
        Rows in <code className="font-mono">producer_product</code>, the table that resolves
        the many-to-many between producers and products.
      </p>
      <SuppliedProducts
        producerId={p.producer_id}
        products={p.products}
        onChanged={() => setVersion((v) => v + 1)}
      />
    </div>
  );
}
