"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { productInputSchema, type ProductInput } from "@/lib/validation/product";
import { ApiError, apiFetch } from "@/lib/client-api";
import type { Product } from "@/lib/types";

interface Props {
  /** Existing product when editing; omit when creating. */
  initial?: Product;
  submitLabel: string;
  cancelHref: string;
  /** Sends the validated data to the API. Throw ApiError on failure. */
  onSubmit: (input: ProductInput) => Promise<void>;
}

type FormValues = Record<
  "name" | "sku" | "category" | "unit_price" | "reorder_level" | "description",
  string
>;

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function toFormValues(product?: Product): FormValues {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    unit_price: product ? String(product.unit_price) : "",
    reorder_level: product ? String(product.reorder_level) : "0",
    description: product?.description ?? "",
  };
}

// Number inputs give us strings. An empty box must stay "missing" rather
// than becoming 0, otherwise a blank price would silently save as free.
function toNumber(text: string): number | undefined {
  return text.trim() === "" ? undefined : Number(text);
}

export default function ProductForm({ initial, submitLabel, cancelHref, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Existing categories become suggestions in the category box.
  useEffect(() => {
    apiFetch<string[]>("/api/products/categories")
      .then(setCategories)
      .catch(() => {}); // suggestions are optional; ignore failures
  }, []);

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Same zod schema the API uses, so the user sees mistakes instantly.
    // The API still validates again: the browser can't be trusted.
    const parsed = productInputSchema.safeParse({
      name: values.name,
      sku: values.sku,
      category: values.category,
      description: values.description,
      unit_price: toNumber(values.unit_price),
      reorder_level: toNumber(values.reorder_level),
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormValues;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const errors: FieldErrors = {};
        for (const fe of err.fieldErrors) {
          errors[fe.field as keyof FormValues] ??= fe.message;
        }
        setFieldErrors(errors);
      } else {
        setFormError("Could not reach the server. Is `npm run dev` still running?");
      }
      setSaving(false);
    }
  }

  const inputClass = (field: keyof FormValues) =>
    `mt-1 block w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 ${
      fieldErrors[field] ? "border-red-400" : "border-slate-300"
    }`;

  const errorText = (field: keyof FormValues) =>
    fieldErrors[field] ? (
      <p className="mt-1 text-xs text-red-600">{fieldErrors[field]}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-5">
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Name *
          <input
            className={inputClass("name")}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={200}
          />
          {errorText("name")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          SKU *
          <input
            className={`${inputClass("sku")} font-mono uppercase`}
            value={values.sku}
            onChange={(e) => update("sku", e.target.value)}
            placeholder="LAP-DEL-L15"
            maxLength={64}
          />
          {errorText("sku")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Category
          <input
            className={inputClass("category")}
            value={values.category}
            onChange={(e) => update("category", e.target.value)}
            list="category-options"
            maxLength={100}
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errorText("category")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Unit price (₹) *
          <input
            className={inputClass("unit_price")}
            type="number"
            min="0"
            step="0.01"
            value={values.unit_price}
            onChange={(e) => update("unit_price", e.target.value)}
          />
          {errorText("unit_price")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Reorder level
          <input
            className={inputClass("reorder_level")}
            type="number"
            min="0"
            step="1"
            value={values.reorder_level}
            onChange={(e) => update("reorder_level", e.target.value)}
          />
          {errorText("reorder_level")}
        </label>

        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Description
          <textarea
            className={inputClass("description")}
            rows={4}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            maxLength={5000}
          />
          <p className="mt-1 text-xs text-slate-500">
            Used later for &quot;similar products&quot; search, so describe what the product is.
          </p>
          {errorText("description")}
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
