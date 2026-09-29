"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { VectorIndexStatus } from "@/lib/types";

/**
 * One line under the search box in "by meaning" mode: how the Qdrant copy
 * of the catalogue compares with PostgreSQL, plus a Rebuild button.
 * `refreshKey` changes each time a search finishes, since the first search
 * in an organization can index its products by itself.
 */
export default function SearchIndexStatus({ refreshKey }: { refreshKey: string }) {
  const [status, setStatus] = useState<VectorIndexStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<VectorIndexStatus>("/api/vector-index", { signal: controller.signal })
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Could not check the search index.");
      });
    return () => controller.abort();
  }, [refreshKey]);

  async function rebuild() {
    setRebuilding(true);
    try {
      setStatus(await apiFetch<VectorIndexStatus>("/api/vector-index", { method: "POST" }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rebuilding the search index failed.");
    } finally {
      setRebuilding(false);
    }
  }

  const problems = status
    ? [
        status.stale > 0 && `${status.stale} changed since indexing`,
        status.missing > 0 && `${status.missing} not indexed`,
        status.orphaned > 0 && `${status.orphaned} deleted but still indexed`,
      ].filter(Boolean)
    : [];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {error ? (
        <span className="text-amber-700">{error}</span>
      ) : status ? (
        <span>
          Search index (Qdrant): {status.up_to_date} of {status.products} products up to date
          {problems.length > 0 && <span className="text-amber-700"> · {problems.join(", ")}</span>}
        </span>
      ) : (
        <span>Checking search index...</span>
      )}
      <button
        onClick={rebuild}
        disabled={rebuilding}
        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {rebuilding ? "Rebuilding..." : "Rebuild index"}
      </button>
    </div>
  );
}
