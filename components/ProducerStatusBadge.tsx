import type { ProducerStatus } from "@/lib/types";

const styles: Record<ProducerStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-200",
  SUSPENDED: "bg-red-50 text-red-700 ring-red-200",
};

export default function ProducerStatusBadge({ status }: { status: ProducerStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
