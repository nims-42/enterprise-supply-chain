// Cosine similarity from vector search (1 = same meaning, 0 = unrelated),
// shown as the number plus a small bar. Real product matches with this
// model mostly land between 0.3 and 0.8, so the bar is scaled to that range
// to make differences visible.

export default function SimilarityScore({ score }: { score: number }) {
  const fill = Math.min(1, Math.max(0, (score - 0.2) / 0.6));
  const strong = score >= 0.5;
  return (
    <span className="inline-flex items-center gap-2" title={`Cosine similarity ${score}`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <span
          className={`block h-full rounded-full ${strong ? "bg-emerald-500" : "bg-slate-400"}`}
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </span>
      <span className="tabular-nums text-xs text-slate-600">{score.toFixed(2)}</span>
    </span>
  );
}
