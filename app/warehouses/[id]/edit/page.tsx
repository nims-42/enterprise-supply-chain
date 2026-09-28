"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import WarehouseForm from "@/components/WarehouseForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { WarehouseDetail } from "@/lib/types";

interface LoadResult {
  id: string;
  warehouse?: WarehouseDetail;
  error?: string;
}

export default function EditWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);

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
  }, [id]);

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;
  if (result.error || !result.warehouse) return <p className="text-red-700">{result.error}</p>;

  const warehouse = result.warehouse;

  return (
    <div>
      <Link href={`/warehouses/${id}`} className="text-sm text-slate-500 hover:underline">
        &larr; {warehouse.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Edit warehouse</h1>
      <WarehouseForm
        initial={warehouse}
        submitLabel="Save changes"
        cancelHref={`/warehouses/${id}`}
        onSubmit={async (input) => {
          await apiFetch(`/api/warehouses/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          });
          router.push(`/warehouses/${id}`);
        }}
      />
    </div>
  );
}
