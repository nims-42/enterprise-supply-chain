"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate, formatINR } from "@/lib/format";
import type { CustomerListResponse } from "@/lib/types";

const PAGE_SIZE = 10;

interface LoadResult {
  key: string;
  data?: CustomerListResponse;
  error?: string;
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const requestKey = `${debouncedSearch}|${page}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    const key = `${debouncedSearch}|${page}`;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (debouncedSearch) params.set("q", debouncedSearch);

    const controller = new AbortController();
    apiFetch<CustomerListResponse>(`/api/customers?${params}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Could not load customers.",
        });
      });
    return () => controller.abort();
  }, [debouncedSearch, page]);

  const data = result?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : " "}
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New customer
        </Link>
      </div>

      <div className="mt-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone"
          className="w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {result?.error && !loading && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Open</th>
              <th className="px-4 py-3 text-right">Completed value</th>
              <th className="px-4 py-3">Last order</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
            {data?.data.map((c) => (
              <tr key={c.customer_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.customer_id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-500">{c.address ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{c.email ?? "-"}</div>
                  <div className="text-xs text-slate-500">{c.phone ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.order_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.open_orders}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(c.total_spent)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {c.last_order_date ? formatDate(c.last_order_date) : (
                    <span className="text-slate-400">never</span>
                  )}
                </td>
              </tr>
            ))}
            {data && data.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No customers match.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > PAGE_SIZE && (
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
