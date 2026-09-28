"use client";

import { useState } from "react";
import Link from "next/link";
import { warehouseInputSchema, type WarehouseInput } from "@/lib/validation/warehouse";
import { ApiError } from "@/lib/client-api";
import type { Warehouse } from "@/lib/types";

interface Props {
  initial?: Warehouse;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: WarehouseInput) => Promise<void>;
}

type FormValues = Record<"name" | "location" | "capacity", string>;
type FieldErrors = Partial<Record<keyof FormValues, string>>;

export default function WarehouseForm({ initial, submitLabel, cancelHref, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>({
    name: initial?.name ?? "",
    location: initial?.location ?? "",
    capacity: initial ? String(initial.capacity) : "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Same schema as the API; the API still re-checks everything.
    const parsed = warehouseInputSchema.safeParse({
      name: values.name,
      location: values.location,
      capacity: values.capacity.trim() === "" ? undefined : Number(values.capacity),
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as keyof FormValues] ??= issue.message;
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
        for (const fe of err.fieldErrors) errors[fe.field as keyof FormValues] ??= fe.message;
        setFieldErrors(errors);
      } else {
        setFormError("Could not reach the server. Is `npm run dev` still running?");
      }
      setSaving(false);
    }
  }

  const inputClass = (field: keyof FormValues) =>
    `mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 ${
      fieldErrors[field] ? "border-red-400" : "border-slate-300"
    }`;

  const errorText = (field: keyof FormValues) =>
    fieldErrors[field] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[field]}</p> : null;

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
            maxLength={150}
          />
          {errorText("name")}
        </label>

        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Location *
          <input
            className={inputClass("location")}
            value={values.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="Area, City, State"
            maxLength={500}
          />
          {errorText("location")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Capacity (units) *
          <input
            className={inputClass("capacity")}
            type="number"
            min="1"
            step="1"
            value={values.capacity}
            onChange={(e) => update("capacity", e.target.value)}
          />
          {errorText("capacity")}
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
