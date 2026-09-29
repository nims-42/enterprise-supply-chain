"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";

interface Month {
  month: string; // "YYYY-MM"
  revenue: number;
  orders: number;
}

const monthName = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function toDate(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Short rupee amount for the label above a bar: ₹4.2L, ₹85K. */
function compactINR(amount: number) {
  if (amount >= 10_00_000) return `₹${(amount / 10_00_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${Math.round(amount / 1_000)}K`;
  return `₹${Math.round(amount)}`;
}

/**
 * Revenue per month as bars. One series, so no legend. Hovering (or
 * focusing) a month shows its exact revenue and order count; only the
 * current month is labelled permanently.
 */
export default function RevenueChart({ months }: { months: Month[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => m.revenue), 1);
  const current = months.length - 1;

  return (
    <div>
      <div className="relative flex h-44 items-end gap-3 border-b border-slate-200 pt-6">
        {months.map((m, i) => {
          const height = m.revenue > 0 ? Math.max(3, (m.revenue / max) * 100) : 0;
          const showLabel = i === current || i === active;
          return (
            <button
              key={m.month}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${monthYear.format(toDate(m.month))}: ${formatINR(m.revenue)} from ${m.orders} orders`}
              className="group relative flex h-full flex-1 items-end justify-center outline-none"
            >
              {showLabel && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-slate-700"
                  style={{ bottom: `calc(${height}% + 4px)` }}
                >
                  {compactINR(m.revenue)}
                </span>
              )}
              <span
                className={`block w-full max-w-10 rounded-t ${
                  i === active ? "bg-emerald-600" : "bg-emerald-500"
                } group-focus-visible:ring-2 group-focus-visible:ring-slate-400`}
                style={{ height: `${height}%` }}
              />
              {i === active && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-lg">
                  <span className="block font-medium">{monthYear.format(toDate(m.month))}</span>
                  <span className="block tabular-nums">{formatINR(m.revenue)}</span>
                  <span className="block text-slate-300">
                    {m.orders} order{m.orders === 1 ? "" : "s"}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">
        {months.map((m) => (
          <span key={m.month} className="flex-1 text-center text-xs text-slate-500">
            {monthName.format(toDate(m.month))}
          </span>
        ))}
      </div>
    </div>
  );
}
