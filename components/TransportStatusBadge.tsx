import type { TransportStatus } from "@/lib/types";

const styles: Record<TransportStatus, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  IN_USE: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  MAINTENANCE: "bg-amber-50 text-amber-800 ring-amber-200",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function TransportStatusBadge({ status }: { status: TransportStatus }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ");
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[status]}`}
    >
      {label}
    </span>
  );
}
