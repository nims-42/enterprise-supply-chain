"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatINR } from "@/lib/format";
import { addSupplySchema, supplyTermsSchema } from "@/lib/validation/producer";
import type { ProductListResponse, SuppliedProduct } from "@/lib/types";

interface Props {
  producerId: number;
  products: SuppliedProduct[];
  /** Called after any add / edit / remove so the page reloads its data. */
  onChanged: () => void;
}

interface TermsForm {
  supply_price: string;
  lead_time_days: string;
  minimum_order_quantity: string;
}

const emptyTerms: TermsForm = { supply_price: "", lead_time_days: "", minimum_order_quantity: "1" };

const num = (text: string) => (text.trim() === "" ? undefined : Number(text));

function termsFromForm(form: TermsForm) {
  return {
    supply_price: num(form.supply_price),
    lead_time_days: num(form.lead_time_days),
    minimum_order_quantity: num(form.minimum_order_quantity),
  };
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Invalid input";
}

/**
 * The producer_product rows for one producer: a table of what it supplies
 * with inline editing of the terms, plus a form to link another product.
 */
export default function SuppliedProducts({ producerId, products, onChanged }: Props) {
  const [catalogue, setCatalogue] = useState<{ product_id: number; name: string; sku: string }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Row being edited, and its draft values
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TermsForm>(emptyTerms);

  // "Add product" form
  const [newProductId, setNewProductId] = useState("");
  const [newTerms, setNewTerms] = useState<TermsForm>(emptyTerms);

  // Our whole catalogue, for the "add product" dropdown (max 100 per request;
  // enough for a college-sized demo organization).
  useEffect(() => {
    apiFetch<ProductListResponse>("/api/products?limit=100")
      .then((res) => setCatalogue(res.data))
      .catch(() => setError("Could not load the product list."));
  }, []);

  const linkedIds = new Set(products.map((p) => p.product_id));
  const available = catalogue.filter((p) => !linkedIds.has(p.product_id));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = addSupplySchema.safeParse({
      product_id: num(newProductId),
      ...termsFromForm(newTerms),
    });
    if (!parsed.success) return setError(firstIssue(parsed.error));

    const ok = await run(() =>
      apiFetch(`/api/producers/${producerId}/products`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      }),
    );
    if (ok) {
      setNewProductId("");
      setNewTerms(emptyTerms);
    }
  }

  function startEdit(p: SuppliedProduct) {
    setEditingId(p.product_id);
    setError(null);
    setEditForm({
      supply_price: String(p.supply_price),
      lead_time_days: String(p.lead_time_days),
      minimum_order_quantity: String(p.minimum_order_quantity),
    });
  }

  async function saveEdit(productId: number) {
    const parsed = supplyTermsSchema.safeParse(termsFromForm(editForm));
    if (!parsed.success) return setError(firstIssue(parsed.error));

    const ok = await run(() =>
      apiFetch(`/api/producers/${producerId}/products/${productId}`, {
        method: "PUT",
        body: JSON.stringify(parsed.data),
      }),
    );
    if (ok) setEditingId(null);
  }

  function remove(productId: number) {
    run(() =>
      apiFetch(`/api/producers/${producerId}/products/${productId}`, { method: "DELETE" }),
    );
  }

  const cellInput =
    "w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums";

  return (
    <div>
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Our price</th>
              <th className="px-4 py-3 text-right">Supply price</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Lead time (days)</th>
              <th className="px-4 py-3 text-right">Min. order</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => {
              const editing = editingId === p.product_id;
              const marginPct = p.unit_price > 0 ? (p.margin / p.unit_price) * 100 : 0;
              return (
                <tr key={p.product_id}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.product_id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.unit_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        className={cellInput}
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.supply_price}
                        onChange={(e) => setEditForm({ ...editForm, supply_price: e.target.value })}
                      />
                    ) : (
                      formatINR(p.supply_price)
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${p.margin < 0 ? "text-red-600" : ""}`}
                  >
                    {formatINR(p.margin)}
                    <div className="text-xs text-slate-500">{marginPct.toFixed(1)}%</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        className={cellInput}
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.lead_time_days}
                        onChange={(e) => setEditForm({ ...editForm, lead_time_days: e.target.value })}
                      />
                    ) : (
                      p.lead_time_days
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        className={cellInput}
                        type="number"
                        min="1"
                        step="1"
                        value={editForm.minimum_order_quantity}
                        onChange={(e) =>
                          setEditForm({ ...editForm, minimum_order_quantity: e.target.value })
                        }
                      />
                    ) : (
                      p.minimum_order_quantity
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {editing ? (
                      <>
                        <button
                          onClick={() => saveEdit(p.product_id)}
                          disabled={busy}
                          className="mr-3 text-sm font-medium text-slate-900 hover:underline disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sm text-slate-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(p)}
                          disabled={busy}
                          className="mr-3 text-sm text-slate-700 hover:underline disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(p.product_id)}
                          disabled={busy}
                          className="text-sm text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  This producer doesn&apos;t supply any products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleAdd}
        noValidate
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4"
      >
        <label className="text-xs font-medium text-slate-600">
          Add product
          <select
            value={newProductId}
            onChange={(e) => setNewProductId(e.target.value)}
            className="mt-1 block w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Choose a product...</option>
            {available.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Supply price (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            value={newTerms.supply_price}
            onChange={(e) => setNewTerms({ ...newTerms, supply_price: e.target.value })}
            className="mt-1 block w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Lead time (days)
          <input
            type="number"
            min="0"
            step="1"
            value={newTerms.lead_time_days}
            onChange={(e) => setNewTerms({ ...newTerms, lead_time_days: e.target.value })}
            className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Min. order
          <input
            type="number"
            min="1"
            step="1"
            value={newTerms.minimum_order_quantity}
            onChange={(e) => setNewTerms({ ...newTerms, minimum_order_quantity: e.target.value })}
            className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
