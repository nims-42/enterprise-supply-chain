"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { ProductDetail } from "@/lib/types";

interface LoadResult {
  id: string;
  product?: ProductDetail;
  error?: string;
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ProductDetail>(`/api/products/${id}`, { signal: controller.signal })
      .then((product) => setResult({ id, product }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          error: err instanceof ApiError ? err.message : "Could not load the product.",
        });
      });
    return () => controller.abort();
  }, [id]);

  if (!result || result.id !== id) return <p className="text-slate-500">Loading...</p>;
  if (result.error || !result.product) return <p className="text-red-700">{result.error}</p>;

  const product = result.product;

  return (
    <div>
      <Link href={`/products/${id}`} className="text-sm text-slate-500 hover:underline">
        &larr; {product.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Edit product</h1>
      <ProductForm
        initial={product}
        submitLabel="Save changes"
        cancelHref={`/products/${id}`}
        onSubmit={async (input) => {
          await apiFetch(`/api/products/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
          });
          router.push(`/products/${id}`);
        }}
      />
    </div>
  );
}
