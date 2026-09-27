"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import { apiFetch } from "@/lib/client-api";
import type { Product } from "@/lib/types";

export default function NewProductPage() {
  const router = useRouter();

  return (
    <div>
      <Link href="/products" className="text-sm text-slate-500 hover:underline">
        &larr; Products
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">New product</h1>
      <ProductForm
        submitLabel="Create product"
        cancelHref="/products"
        onSubmit={async (input) => {
          const created = await apiFetch<Product>("/api/products", {
            method: "POST",
            body: JSON.stringify(input),
          });
          router.push(`/products/${created.product_id}`);
        }}
      />
    </div>
  );
}
