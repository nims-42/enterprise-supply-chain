"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatINR } from "@/lib/format";
import type { ProductListItem, ProductListResponse, ProductMatchResponse } from "@/lib/types";
import StockBadge from "@/components/StockBadge";
import SimilarityScore from "@/components/SimilarityScore";
import SearchIndexStatus from "@/components/SearchIndexStatus";

const PAGE_SIZE = 10;
const MEANING_RESULTS = 15;

// "keyword": name or SKU contains the text (ILIKE in PostgreSQL).
// "meaning": closest in meaning to the text (vector search in Qdrant).
type SearchMode = "keyword" | "meaning";

interface LoadResult {
  key: string;
  data?: ProductListResponse;
  matches?: ProductMatchResponse["data"];
  error?: string;
}

export default function ProductsPage() {
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [result, setResult] = useState<LoadResult | null>(null);

  // Wait until the user stops typing for 300 ms before searching, instead
  // of sending one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    apiFetch<string[]>("/api/products/categories")
      .then(setCategories)
      .catch(() => {});
  }, []);

  // Searching by meaning needs some text to compare against.
  const needsText = mode === "meaning" && debouncedSearch.length < 2;

  // Which request the screen should be showing. If the last result belongs to
  // an older request, we're still loading.
  const requestKey = `${mode}|${debouncedSearch}|${category}|${page}`;
  const loading = !needsText && result?.key !== requestKey;

  useEffect(() => {
    if (needsText) return;
    const key = `${mode}|${debouncedSearch}|${category}|${page}`;

    // Abort the request if the filters change before it finishes, so a slow
    // old response can never overwrite a newer one.
    const controller = new AbortController();
    const fail = (err: unknown) => {
      if (controller.signal.aborted) return;
      setResult({
        key,
        error: err instanceof ApiError ? err.message : "Could not load products.",
      });
    };

    if (mode === "meaning") {
      const params = new URLSearchParams({ q: debouncedSearch, limit: String(MEANING_RESULTS) });
      if (category) params.set("category", category);
      apiFetch<ProductMatchResponse>(`/api/products/search?${params}`, {
        signal: controller.signal,
      })
        .then(({ data }) => setResult({ key, matches: data }))
        .catch(fail);
    } else {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (category) params.set("category", category);
      apiFetch<ProductListResponse>(`/api/products?${params}`, { signal: controller.signal })
        .then((data) => setResult({ key, data }))
        .catch(fail);
    }
    return () => controller.abort();
  }, [mode, needsText, debouncedSearch, category, page]);

  const current = needsText || result?.key !== requestKey ? undefined : result;
  const data = mode === "keyword" ? (result?.data ?? undefined) : undefined;
  const rows: (ProductListItem & { score?: number })[] =
    mode === "meaning" ? (needsText ? [] : (result?.matches ?? [])) : (data?.data ?? []);
  const hasRows = mode === "meaning" ? !!result?.matches : !!data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const columns = mode === "meaning" ? 6 : 5;

  let countText = " ";
  if (mode === "keyword" && data) {
    countText = `${data.total} product${data.total === 1 ? "" : "s"}`;
  } else if (mode === "meaning" && current?.matches) {
    const n = current.matches.length;
    countText = `${n} match${n === 1 ? "" : "es"}, closest first`;
  }

  const modeButton = (value: SearchMode, label: string) => (
    <button
      onClick={() => {
        setMode(value);
        setPage(0);
      }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        mode === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="min-h-5 text-sm text-slate-500">{countText}</p>
        </div>
        <Link
          href="/products/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New product
        </Link>
      </div>

      <div className="mt-6 flex gap-1">
        {modeButton("keyword", "Name or SKU")}
        {modeButton("meaning", "By meaning")}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            mode === "meaning"
              ? "Describe it, e.g. wireless mouse for the office"
              : "Search by name or SKU"
          }
          className="w-96 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {mode === "meaning" && <SearchIndexStatus refreshKey={result?.key ?? ""} />}

      {result?.error && !loading && !needsText && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              {mode === "meaning" && <th className="px-4 py-3">Similarity</th>}
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Available / On hand</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
            {rows.map((p) => (
              <tr key={p.product_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/products/${p.product_id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.category ?? "-"}</td>
                {mode === "meaning" && (
                  <td className="px-4 py-3">
                    {p.score !== undefined && <SimilarityScore score={p.score} />}
                  </td>
                )}
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.unit_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {p.total_available} / {p.total_quantity}
                </td>
                <td className="px-4 py-3">
                  <StockBadge
                    quantity={p.total_quantity}
                    available={p.total_available}
                    reorderLevel={p.reorder_level}
                  />
                </td>
              </tr>
            ))}
            {needsText && (
              <tr>
                <td colSpan={columns} className="px-4 py-10 text-center text-slate-500">
                  Describe what you&apos;re looking for. Products are matched on the meaning of
                  their name, category and description, not on exact words.
                </td>
              </tr>
            )}
            {!needsText && hasRows && rows.length === 0 && !result?.error && (
              <tr>
                <td colSpan={columns} className="px-4 py-10 text-center text-slate-500">
                  {mode === "meaning" ? "Nothing close enough in meaning." : "No products match."}
                </td>
              </tr>
            )}
            {!needsText && !hasRows && loading && (
              <tr>
                <td colSpan={columns} className="px-4 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode === "keyword" && data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0 || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages || loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
