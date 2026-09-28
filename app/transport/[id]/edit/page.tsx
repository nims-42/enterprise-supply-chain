"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import TransportForm from "@/components/TransportForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { TransportDetail } from "@/lib/types";

interface LoadResult {
  id: string;
  vehicle?: TransportDetail;
  error?: string;
}

export default function EditTransportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);

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

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;
  if (result.error || !result.vehicle) return <p className="text-red-700">{result.error}</p>;

  const vehicle = result.vehicle;

  return (
    <div>
      <Link href={`/transport/${id}`} className="text-sm text-slate-500 hover:underline">
        &larr; {vehicle.vehicle_number}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Edit vehicle</h1>
      <TransportForm
        initial={vehicle}
        submitLabel="Save changes"
        cancelHref={`/transport/${id}`}
        onSubmit={async (input) => {
          await apiFetch(`/api/transport/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          });
          router.push(`/transport/${id}`);
        }}
      />
    </div>
  );
}
