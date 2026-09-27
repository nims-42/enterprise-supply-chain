interface Props {
  quantity: number;
  available: number;
  reorderLevel: number;
}

/**
 * Stock status from the same rule the database views will use:
 * available = quantity - reserved, "low" when available <= reorder level.
 */
export default function StockBadge({ quantity, available, reorderLevel }: Props) {
  let label = "In stock";
  let style = "bg-emerald-50 text-emerald-700 ring-emerald-200";

  if (quantity === 0) {
    label = "Not stocked";
    style = "bg-slate-100 text-slate-600 ring-slate-200";
  } else if (available <= 0) {
    label = "Fully reserved";
    style = "bg-red-50 text-red-700 ring-red-200";
  } else if (available <= reorderLevel) {
    label = "Low stock";
    style = "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style}`}>
      {label}
    </span>
  );
}
