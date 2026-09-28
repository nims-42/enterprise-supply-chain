"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TRANSPORT_TYPES,
  transportInputSchema,
  type TransportInput,
} from "@/lib/validation/transport";
import { ApiError } from "@/lib/client-api";
import type { Transport } from "@/lib/types";

interface Props {
  initial?: Transport;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: TransportInput) => Promise<void>;
}

type FormValues = Record<
  "vehicle_number" | "transport_type" | "carrier_name" | "capacity" | "status",
  string
>;
type FieldErrors = Partial<Record<keyof FormValues, string>>;

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");

export default function TransportForm({ initial, submitLabel, cancelHref, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>({
    vehicle_number: initial?.vehicle_number ?? "",
    transport_type: initial?.transport_type ?? "TRUCK",
    carrier_name: initial?.carrier_name ?? "",
    capacity: initial ? String(initial.capacity) : "",
    status: initial?.status ?? "AVAILABLE",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // IN_USE is set and cleared by shipments, so the form never offers it
  // and locks the status while the vehicle is out on a delivery.
  const inUse = initial?.status === "IN_USE";

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = transportInputSchema.safeParse({
      ...values,
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
    `mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100 ${
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
        <label className="block text-sm font-medium text-slate-700">
          Vehicle number *
          <input
            className={`${inputClass("vehicle_number")} font-mono uppercase`}
            value={values.vehicle_number}
            onChange={(e) => update("vehicle_number", e.target.value)}
            placeholder="KA-01-AB-4521"
            maxLength={30}
          />
          {errorText("vehicle_number")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Type *
          <select
            className={inputClass("transport_type")}
            value={values.transport_type}
            onChange={(e) => update("transport_type", e.target.value)}
          >
            {TRANSPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
          {errorText("transport_type")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Carrier
          <input
            className={inputClass("carrier_name")}
            value={values.carrier_name}
            onChange={(e) => update("carrier_name", e.target.value)}
            placeholder="In-house fleet"
            maxLength={150}
          />
          {errorText("carrier_name")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Capacity (kg) *
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

        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            className={inputClass("status")}
            value={values.status}
            onChange={(e) => update("status", e.target.value)}
            disabled={inUse}
          >
            {inUse ? (
              <option value="IN_USE">In use</option>
            ) : (
              ["AVAILABLE", "MAINTENANCE", "INACTIVE"].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))
            )}
          </select>
          {inUse && (
            <p className="mt-1 text-xs text-slate-500">
              Out on a shipment; becomes available when it is delivered.
            </p>
          )}
          {errorText("status")}
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
