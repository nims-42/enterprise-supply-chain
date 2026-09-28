"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { WarehouseSummary } from "@/lib/types";
import CapacityBar from "@/components/CapacityBar";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then(setWarehouses)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not load warehouses."),
      );
  }, []);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Warehouses</h1>
          <p className="text-sm text-slate-500">
            {warehouses ? `${warehouses.length} locations` : " "}
          </p>
        </div>
        <Link
          href="/warehouses/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New warehouse
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!warehouses && !error && <p className="mt-6 text-slate-500">Loading...</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {warehouses?.map((w) => (
          <Link
            key={w.warehouse_id}
            href={`/warehouses/${w.warehouse_id}`}
            className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-400"
          >
            <p className="font-semibold">{w.name}</p>
            <p className="text-sm text-slate-500">{w.location}</p>
            <div className="mt-4">
              <CapacityBar held={w.units_held} capacity={w.capacity} />
            </div>
            <div className="mt-4 flex gap-4 text-xs text-slate-600">
              <span>{w.product_count} products</span>
              <span>{w.units_reserved} reserved</span>
              {w.low_stock_count > 0 && (
                <span className="text-amber-700">{w.low_stock_count} low stock</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
