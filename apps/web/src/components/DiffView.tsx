import { diffWordsWithSpace } from "diff";

export default function DiffView({ a, b, className = "" }: { a: string; b: string; className?: string }) {
  const parts = diffWordsWithSpace(a, b);
  return (
    <pre className={`mono overflow-auto rounded-xl bg-ink-950 p-3 text-xs whitespace-pre-wrap text-gray-300 ${className}`} data-testid="diff">
      {parts.map((p, i) => (
        <span key={i} className={p.added ? "rounded bg-emerald-500/20 text-emerald-200" : p.removed ? "rounded bg-rose-500/20 text-rose-200 line-through decoration-rose-400/60" : ""}>
          {p.value}
        </span>
      ))}
    </pre>
  );
}
