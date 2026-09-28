"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import WarehouseForm from "@/components/WarehouseForm";
import { apiFetch } from "@/lib/client-api";
import type { Warehouse } from "@/lib/types";

export default function NewWarehousePage() {
  const router = useRouter();

  return (
    <div>
      <Link href="/warehouses" className="text-sm text-slate-500 hover:underline">
        &larr; Warehouses
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New warehouse</h1>
      <WarehouseForm
        submitLabel="Create warehouse"
        cancelHref="/warehouses"
        onSubmit={async (input) => {
          const created = await apiFetch<Warehouse>("/api/warehouses", {
            method: "POST",
            body: JSON.stringify(input),
          });
          router.push(`/warehouses/${created.warehouse_id}`);
        }}
      />
    </div>
  );
}
