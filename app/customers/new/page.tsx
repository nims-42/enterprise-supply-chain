"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { apiFetch } from "@/lib/client-api";
import type { Customer } from "@/lib/types";

export default function NewCustomerPage() {
  const router = useRouter();

  return (
    <div>
      <Link href="/customers" className="text-sm text-slate-500 hover:underline">
        &larr; Customers
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New customer</h1>
      <CustomerForm
        submitLabel="Create customer"
        cancelHref="/customers"
        onSubmit={async (input) => {
          const created = await apiFetch<Customer>("/api/customers", {
            method: "POST",
            body: JSON.stringify(input),
          });
          router.push(`/customers/${created.customer_id}`);
        }}
      />
    </div>
  );
}
