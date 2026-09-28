"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { WarehouseDetail } from "@/lib/types";
import CapacityBar from "@/components/CapacityBar";
import InventoryTable from "@/components/InventoryTable";
import { ReceiveStockForm } from "@/components/StockMovementForms";

interface LoadResult {
  id: string;
  warehouse?: WarehouseDetail;
  error?: string;
}

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [version, setVersion] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<WarehouseDetail>(`/api/warehouses/${id}`, { signal: controller.signal })
      .then((warehouse) => setResult({ id, warehouse }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the warehouse.",
        });
      });
    return () => controller.abort();
  }, [id, version]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/warehouses/${id}`, { method: "DELETE" });
      router.push("/warehouses");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;

  if (result.error || !result.warehouse) {
    return (
      <div>
        <p className="text-red-700">{result.error}</p>
        <Link href="/warehouses" className="mt-4 inline-block text-sm underline">
          Back to warehouses
        </Link>
      </div>
    );
  }

  const w = result.warehouse;
  const held = w.inventory.reduce((sum, row) => sum + row.quantity, 0);
  const reload = () => setVersion((v) => v + 1);

  return (
    <div className="max-w-6xl">
      <Link href="/warehouses" className="text-sm text-slate-500 hover:underline">
        &larr; Warehouses
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{w.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{w.location}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/warehouses/${w.warehouse_id}/edit`}
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

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <p className="mb-1 text-slate-500">Capacity used</p>
        <CapacityBar held={held} capacity={w.capacity} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">Receive stock</h2>
      <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <ReceiveStockForm fixedWarehouseId={w.warehouse_id} refreshKey={version} onDone={reload} />
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Stock in this warehouse</h2>
      <InventoryTable
        rows={w.inventory}
        showWarehouse={false}
        onChanged={reload}
        emptyText="Nothing stored here yet."
      />
    </div>
  );
}
