"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { CustomerDetail } from "@/lib/types";

interface LoadResult {
  id: string;
  customer?: CustomerDetail;
  error?: string;
}

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<CustomerDetail>(`/api/customers/${id}`, { signal: controller.signal })
      .then((customer) => setResult({ id, customer }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the customer.",
        });
      });
    return () => controller.abort();
  }, [id]);

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;
  if (result.error || !result.customer) return <p className="text-red-700">{result.error}</p>;

  const customer = result.customer;

  return (
    <div>
      <Link href={`/customers/${id}`} className="text-sm text-slate-500 hover:underline">
        &larr; {customer.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Edit customer</h1>
      <CustomerForm
        initial={customer}
        submitLabel="Save changes"
        cancelHref={`/customers/${id}`}
        onSubmit={async (input) => {
          await apiFetch(`/api/customers/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          });
          router.push(`/customers/${id}`);
        }}
      />
    </div>
  );
}
