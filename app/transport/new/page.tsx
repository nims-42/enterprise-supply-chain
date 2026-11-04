"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TransportForm from "@/components/TransportForm";
import { apiFetch } from "@/lib/client-api";
import type { Transport } from "@/lib/types";

export default function NewTransportPage() {
  const router = useRouter();

  return (
    <div>
      <Link href="/transport" className="text-sm text-slate-500 hover:underline">
        &larr; Transport
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New vehicle</h1>
      <TransportForm
        submitLabel="Add vehicle"
        cancelHref="/transport"
        onSubmit={async (input) => {
          const created = await apiFetch<Transport>("/api/transport", {
            method: "POST",
            body: JSON.stringify(input),
          });
          router.push(`/transport/${created.transport_id}`);
        }}
      />
    </div>
  );
}
