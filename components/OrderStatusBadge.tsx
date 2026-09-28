import type { OrderStatus, ShipmentStatus } from "@/lib/types";

const styles: Record<OrderStatus | ShipmentStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  CREATED: "bg-slate-100 text-slate-700 ring-slate-200",
  CONFIRMED: "bg-sky-50 text-sky-700 ring-sky-200",
  PACKED: "bg-sky-50 text-sky-700 ring-sky-200",
  PROCESSING: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  DISPATCHED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  IN_TRANSIT: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELAYED: "bg-amber-50 text-amber-800 ring-amber-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
};

/** Colour-coded status pill for orders and shipments. */
export default function OrderStatusBadge({ status }: { status: OrderStatus | ShipmentStatus }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ");
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[status]}`}
    >
      {label}
    </span>
  );
}
