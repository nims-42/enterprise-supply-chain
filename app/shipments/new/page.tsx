"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { inboundCreateSchema } from "@/lib/validation/shipment";
import type { ProducerListResponse, WarehouseSummary } from "@/lib/types";

// Book an INBOUND delivery: a producer is sending goods to one of our
// warehouses. What exactly arrives is entered when it is marked delivered.
export default function NewInboundShipmentPage() {
  const router = useRouter();
  const [producers, setProducers] = useState<{ producer_id: number; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [producerId, setProducerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expected, setExpected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<ProducerListResponse>("/api/producers?status=ACTIVE&limit=100")
      .then((res) => setProducers(res.data))
      .catch(() => setError("Could not load producers."));
    apiFetch<WarehouseSummary[]>("/api/warehouses")
      .then(setWarehouses)
      .catch(() => setError("Could not load warehouses."));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = inboundCreateSchema.safeParse({
      producer_id: producerId ? Number(producerId) : undefined,
      warehouse_id: warehouseId ? Number(warehouseId) : undefined,
      expected_delivery: expected || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSaving(true);
    try {
      const created = await apiFetch<{ shipment_id: number }>("/api/shipments", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      router.push(`/shipments/${created.shipment_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
      setSaving(false);
    }
  }

  const fieldClass =
    "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="max-w-2xl">
      <Link href="/shipments" className="text-sm text-slate-500 hover:underline">
        &larr; Shipments
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Book inbound delivery</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        A producer is sending stock to one of your warehouses. You record what arrived when you
        mark it delivered. Only active producers are listed.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700">
          Producer *
          <select className={fieldClass} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
            <option value="">Choose...</option>
            {producers.map((p) => (
              <option key={p.producer_id} value={p.producer_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Deliver to *
          <select
            className={fieldClass}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">Choose a warehouse...</option>
            {warehouses.map((w) => (
              <option key={w.warehouse_id} value={w.warehouse_id}>
                {w.name} ({w.capacity - w.units_held} units free)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Expected delivery
          <input
            type="date"
            className={fieldClass}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Booking..." : "Book delivery"}
          </button>
          <Link
            href="/shipments"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
