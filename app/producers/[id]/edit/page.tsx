"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProducerForm from "@/components/ProducerForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { ProducerDetail } from "@/lib/types";

interface LoadResult {
  id: string;
  producer?: ProducerDetail;
  error?: string;
}

export default function EditProducerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);

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
  }, [id]);

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;
  if (result.error || !result.producer) return <p className="text-red-700">{result.error}</p>;

  const producer = result.producer;

  return (
    <div>
      <Link href={`/producers/${id}`} className="text-sm text-slate-500 hover:underline">
        &larr; {producer.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Edit producer</h1>
      <ProducerForm
        initial={producer}
        submitLabel="Save changes"
        cancelHref={`/producers/${id}`}
        onSubmit={async (input) => {
          await apiFetch(`/api/producers/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          });
          router.push(`/producers/${id}`);
        }}
      />
    </div>
  );
}
