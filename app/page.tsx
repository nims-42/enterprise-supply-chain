"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import type { DashboardData, OrderStatus } from "@/lib/types";
import CapacityBar from "@/components/CapacityBar";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import RevenueChart from "@/components/RevenueChart";
import StockBadge from "@/components/StockBadge";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

function Tile({
  label,
  value,
  detail,
  href,
  alert,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border bg-white p-5 hover:border-slate-300 ${
        alert ? "border-red-200" : "border-slate-200"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-red-600" : "text-slate-900"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}

function Panel({
  title,
  href,
  linkText,
  children,
}: {
  title: string;
  href?: string;
  linkText?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-slate-500 hover:underline">
            {linkText ?? "View all"}
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<DashboardData>("/api/dashboard", { signal: controller.signal })
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Could not load the dashboard.");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!data) return <p className="text-slate-500">Loading...</p>;

  const { counts, stock, orders, shipments } = data;
  const totalOrders = ORDER_STATUSES.reduce((sum, s) => sum + orders.by_status[s], 0);

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-slate-500">
        {counts.products} products across {counts.warehouses} warehouse
        {counts.warehouses === 1 ? "" : "s"}, {counts.customers} customers,{" "}
        {counts.active_producers} active producers
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Stock value"
          value={formatINR(stock.stock_value)}
          detail={`${stock.units_on_hand} units on hand, ${stock.units_reserved} reserved`}
          href="/inventory"
        />
        <Tile
          label="Open orders"
          value={orders.open}
          detail={`${formatINR(orders.revenue_30d)} from ${orders.orders_30d} orders in the last 30 days`}
          href="/orders"
        />
        <Tile
          label="Shipments on the road"
          value={shipments.on_the_road}
          detail={`${shipments.awaiting_dispatch} waiting to go out, ${shipments.inbound_expected} inbound expected`}
          href="/shipments"
        />
        <Tile
          label="Overdue shipments"
          value={shipments.overdue}
          detail={
            shipments.overdue > 0
              ? "Past their expected delivery date"
              : "Everything is on schedule"
          }
          href="/shipments"
          alert={shipments.overdue > 0}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Revenue, last 6 months">
            <RevenueChart months={data.monthly_revenue} />
            <p className="mt-3 text-xs text-slate-500">
              Order totals by order date, cancelled orders left out.
            </p>
          </Panel>
        </div>
        <Panel title="Orders by status" href="/orders">
          <ul className="space-y-3">
            {ORDER_STATUSES.map((status) => {
              const n = orders.by_status[status];
              const pct = totalOrders > 0 ? (n / totalOrders) * 100 : 0;
              return (
                <li key={status}>
                  <div className="flex items-center justify-between text-sm">
                    <OrderStatusBadge status={status} />
                    <span className="tabular-nums text-slate-700">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={`Needs restocking (${data.low_stock.total})`}
          href="/inventory"
          linkText="Open inventory"
        >
          {data.low_stock.items.length === 0 ? (
            <p className="text-sm text-slate-500">Every item is above its reorder level.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Product</th>
                  <th className="pb-2 text-right">Available</th>
                  <th className="pb-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.low_stock.items.map((row) => (
                  <tr key={row.inventory_id}>
                    <td className="py-2">
                      <Link href={`/products/${row.product_id}`} className="font-medium hover:underline">
                        {row.product}
                      </Link>
                      <div className="text-xs text-slate-500">{row.warehouse}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.available}
                      <span className="text-xs text-slate-400"> / min {row.reorder_level}</span>
                    </td>
                    <td className="py-2 pl-3">
                      <StockBadge
                        quantity={row.quantity}
                        available={row.available}
                        reorderLevel={row.reorder_level}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Warehouse capacity" href="/warehouses">
          {data.warehouses.length === 0 ? (
            <p className="text-sm text-slate-500">No warehouses yet.</p>
          ) : (
            <ul className="space-y-4">
              {data.warehouses.map((w) => (
                <li key={w.warehouse_id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <Link href={`/warehouses/${w.warehouse_id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                    <span className="truncate text-xs text-slate-500">{w.location}</span>
                  </div>
                  <CapacityBar held={w.held} capacity={w.capacity} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Recent orders" href="/orders">
          {data.recent_orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.recent_orders.map((o) => (
                <li key={o.order_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/orders/${o.order_id}`} className="font-medium hover:underline">
                      #{o.order_id}
                    </Link>{" "}
                    <span className="text-slate-600">{o.customer_name}</span>
                    <div className="text-xs text-slate-500">{formatDateTime(o.order_date)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums">{formatINR(o.total_amount)}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Overdue shipments" href="/shipments">
          {data.overdue_shipments.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing is running late.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.overdue_shipments.map((s) => (
                <li key={s.shipment_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/shipments/${s.shipment_id}`} className="font-medium hover:underline">
                      #{s.shipment_id}
                    </Link>{" "}
                    <span className="text-slate-600">
                      {s.shipment_type === "OUTBOUND"
                        ? `${s.warehouse} → ${s.counterparty}`
                        : `${s.counterparty} → ${s.warehouse}`}
                    </span>
                    <div className="text-xs text-slate-500">
                      Expected {formatDate(s.expected_delivery)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-medium text-red-600">
                      {s.days_late} day{s.days_late === 1 ? "" : "s"} late
                    </span>
                    <OrderStatusBadge status={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Best sellers" href="/products">
          {data.best_sellers.length === 0 ? (
            <p className="text-sm text-slate-500">No sales yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100 text-sm">
              {data.best_sellers.map((p, i) => (
                <li key={p.product_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    <Link href={`/products/${p.product_id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {p.units} units
                    <div className="text-xs text-slate-500">{formatINR(p.revenue)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Fleet" href="/transport">
          <p className="text-2xl font-semibold tabular-nums">
            {counts.vehicles_available}
            <span className="text-base font-normal text-slate-500"> of {counts.vehicles_total}</span>
          </p>
          <p className="text-sm text-slate-500">vehicles free to take a shipment right now</p>
        </Panel>
      </div>
    </div>
  );
}
