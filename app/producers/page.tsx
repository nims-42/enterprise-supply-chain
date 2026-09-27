"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { PRODUCER_STATUSES } from "@/lib/validation/producer";
import type { ProducerListResponse } from "@/lib/types";
import ProducerStatusBadge from "@/components/ProducerStatusBadge";

const PAGE_SIZE = 10;

interface LoadResult {
  key: string;
  data?: ProducerListResponse;
  error?: string;
}

export default function ProducersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const requestKey = `${debouncedSearch}|${status}|${page}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    const key = `${debouncedSearch}|${status}|${page}`;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (status) params.set("status", status);

    const controller = new AbortController();
    apiFetch<ProducerListResponse>(`/api/producers?${params}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Could not load producers.",
        });
      });
    return () => controller.abort();
  }, [debouncedSearch, status, page]);

  const data = result?.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Producers</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} supplier${data.total === 1 ? "" : "s"}` : " "}
          </p>
        </div>
        <Link
          href="/producers/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New producer
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {PRODUCER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
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
              <th className="px-4 py-3">Producer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Products supplied</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-50" : ""}`}>
            {data?.data.map((p) => (
              <tr key={p.producer_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/producers/${p.producer_id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-slate-500">{p.address ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{p.email ?? "-"}</div>
                  <div className="text-xs text-slate-500">{p.phone ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{p.product_count}</td>
                <td className="px-4 py-3">
                  <ProducerStatusBadge status={p.status} />
                </td>
              </tr>
            ))}
            {data && data.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No producers match.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
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
