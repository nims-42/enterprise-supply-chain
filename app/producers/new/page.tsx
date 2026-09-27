"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProducerForm from "@/components/ProducerForm";
import { apiFetch } from "@/lib/client-api";
import type { Producer } from "@/lib/types";

export default function NewProducerPage() {
  const router = useRouter();

  return (
    <div>
      <Link href="/producers" className="text-sm text-slate-500 hover:underline">
        &larr; Producers
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New producer</h1>
      <ProducerForm
        submitLabel="Create producer"
        cancelHref="/producers"
        onSubmit={async (input) => {
          const created = await apiFetch<Producer>("/api/producers", {
            method: "POST",
            body: JSON.stringify(input),
          });
          router.push(`/producers/${created.producer_id}`);
        }}
      />
    </div>
  );
}
