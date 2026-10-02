import { tierFor } from "@colosseum/core";

export default function RankBadge({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const t = tierFor(rating);
  if (size === "lg")
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ background: `${t.color}22`, boxShadow: `inset 0 0 0 1px ${t.color}55` }}>
          {t.emoji}
        </div>
        <div>
          <div className="text-lg font-extrabold" style={{ color: t.color }}>
            {t.name} {t.division}
          </div>
          <div className="text-sm text-gray-400">Elo {rating}</div>
        </div>
      </div>
    );
  return (
    <span className="chip" style={{ borderColor: `${t.color}55`, color: t.color }} title={`Elo ${rating}`}>
      {t.emoji} {t.name} {t.division} · {rating}
    </span>
  );
}
