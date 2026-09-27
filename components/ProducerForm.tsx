"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PRODUCER_STATUSES,
  producerInputSchema,
  type ProducerInput,
} from "@/lib/validation/producer";
import { ApiError } from "@/lib/client-api";
import type { Producer } from "@/lib/types";

interface Props {
  initial?: Producer;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: ProducerInput) => Promise<void>;
}

type FormValues = Record<"name" | "email" | "phone" | "address" | "status", string>;
type FieldErrors = Partial<Record<keyof FormValues, string>>;

function toFormValues(producer?: Producer): FormValues {
  return {
    name: producer?.name ?? "",
    email: producer?.email ?? "",
    phone: producer?.phone ?? "",
    address: producer?.address ?? "",
    status: producer?.status ?? "ACTIVE",
  };
}

export default function ProducerForm({ initial, submitLabel, cancelHref, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
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
    const parsed = producerInputSchema.safeParse(values);
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

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            className={inputClass("email")}
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            maxLength={255}
          />
          {errorText("email")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Phone
          <input
            className={inputClass("phone")}
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+91 80 2555 1010"
            maxLength={30}
          />
          {errorText("phone")}
        </label>

        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Address
          <textarea
            className={inputClass("address")}
            rows={2}
            value={values.address}
            onChange={(e) => update("address", e.target.value)}
            maxLength={500}
          />
          {errorText("address")}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            className={inputClass("status")}
            value={values.status}
            onChange={(e) => update("status", e.target.value)}
          >
            {PRODUCER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
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
