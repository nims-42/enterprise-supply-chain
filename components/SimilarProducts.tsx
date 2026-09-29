"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatINR } from "@/lib/format";
import type { ProductMatchResponse } from "@/lib/types";
import SimilarityScore from "@/components/SimilarityScore";
import StockBadge from "@/components/StockBadge";

interface LoadResult {
  productId: number;
  data?: ProductMatchResponse["data"];
  error?: string;
}

/**
 * "Similar products" panel on the product page: the closest products in
 * meaning, from vector search in Qdrant. Useful when this product is out of
 * stock and a customer needs an alternative.
 */
export default function SimilarProducts({ productId }: { productId: number }) {
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ProductMatchResponse>(`/api/products/${productId}/similar?limit=5`, {
      signal: controller.signal,
    })
      .then(({ data }) => setResult({ productId, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          productId,
          error: err instanceof ApiError ? err.message : "Could not load similar products.",
        });
      });
    return () => controller.abort();
  }, [productId]);

  const loading = !result || result.productId !== productId;

  return (
    <section>
      <h2 className="mt-8 text-lg font-semibold">Similar products</h2>
      <p className="text-sm text-slate-500">
        Closest in meaning to this product&apos;s name, category and description, found by
        vector search.
      </p>

      {loading && <p className="mt-3 text-sm text-slate-500">Finding similar products...</p>}

      {!loading && result.error && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {result.error}
        </div>
      )}

      {!loading && result.data && result.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No other products to compare with yet.</p>
      )}

      {!loading && result.data && result.data.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Similarity</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.data.map((p) => (
                <tr key={p.product_id}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.product_id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.category ?? "-"}</td>
                  <td className="px-4 py-3">
                    <SimilarityScore score={p.score} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.unit_price)}</td>
                  <td className="px-4 py-3">
                    <StockBadge
                      quantity={p.total_quantity}
                      available={p.total_available}
                      reorderLevel={p.reorder_level}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
