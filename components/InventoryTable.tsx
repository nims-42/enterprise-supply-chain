"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { adjustStockSchema } from "@/lib/validation/inventory";
import type { InventoryRow } from "@/lib/types";
import StockBadge from "@/components/StockBadge";

// Date only in the table (the full time shows on hover) to keep rows compact.
const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

interface Props {
  rows: InventoryRow[];
  /** Show the warehouse column (off on a single warehouse's page). */
  showWarehouse: boolean;
  /** Called after an adjustment or removal so the page reloads. */
  onChanged: () => void;
  emptyText: string;
}

/**
 * Stock rows with two actions:
 *  - Adjust: set the counted quantity (stocktake correction)
 *  - Remove: delete a row that is at zero
 */
export default function InventoryTable({ rows, showWarehouse, onChanged, emptyText }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function saveAdjustment(row: InventoryRow) {
    const parsed = adjustStockSchema.safeParse({
      quantity: draft.trim() === "" ? undefined : Number(draft),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    run(() =>
      apiFetch(`/api/inventory/${row.inventory_id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      }),
    );
  }

  const columns = showWarehouse ? 9 : 8;

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {showWarehouse && <th className="px-4 py-3">Warehouse</th>}
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Reorder at</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const editing = editingId === row.inventory_id;
              return (
                <tr key={row.inventory_id}>
                  {showWarehouse && (
                    <td className="px-4 py-3">
                      <Link href={`/warehouses/${row.warehouse_id}`} className="hover:underline">
                        {row.warehouse}
                      </Link>
                    </td>
                  )}
                  <td className="min-w-48 px-4 py-3">
                    <Link href={`/products/${row.product_id}`} className="font-medium hover:underline">
                      {row.product}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{row.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        type="number"
                        min={row.reserved_quantity}
                        step="1"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                        autoFocus
                      />
                    ) : (
                      row.quantity
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.reserved_quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.available}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {row.reorder_level}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StockBadge
                      quantity={row.quantity}
                      available={row.available}
                      reorderLevel={row.reorder_level}
                    />
                  </td>
                  <td
                    className="px-4 py-3 whitespace-nowrap text-slate-500"
                    title={formatDateTime(row.last_updated)}
                  >
                    {shortDate.format(new Date(row.last_updated))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {editing ? (
                      <>
                        <button
                          onClick={() => saveAdjustment(row)}
                          disabled={busy}
                          className="mr-3 font-medium text-slate-900 hover:underline disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-slate-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(row.inventory_id);
                            setDraft(String(row.quantity));
                            setError(null);
                          }}
                          disabled={busy}
                          className="text-slate-700 hover:underline disabled:opacity-50"
                        >
                          Adjust
                        </button>
                        {row.quantity === 0 && row.reserved_quantity === 0 && (
                          <button
                            onClick={() =>
                              run(() =>
                                apiFetch(`/api/inventory/${row.inventory_id}`, { method: "DELETE" }),
                              )
                            }
                            disabled={busy}
                            className="ml-3 text-red-600 hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-4 py-10 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
