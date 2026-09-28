interface Props {
  held: number;
  capacity: number;
}

/** "427 / 600 units (71%)" with a bar that turns amber at 80% and red at 95%. */
export default function CapacityBar({ held, capacity }: Props) {
  const pct = capacity > 0 ? Math.min(100, (held / capacity) * 100) : 0;
  const colour = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span className="tabular-nums">
          {held} / {capacity} units
        </span>
        <span className="tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
