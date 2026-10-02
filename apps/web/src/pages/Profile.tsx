import { clsx } from "clsx";
import { BADGES, BOSSES, levelFor, tierFor, TIERS } from "@colosseum/core";
import { progressStore, leaderboardStore } from "../lib/state";
import RankBadge from "../components/RankBadge";

export default function Profile() {
  const p = progressStore.use();
  const lvl = levelFor(p.xp);
  const t = tierFor(p.rating);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const name = (id: string) => BOSSES.find((b) => b.id === id)?.name ?? (id.startsWith("daily-") ? `Daily ${id.slice(6)}` : id);
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="card p-5">
          <div className="label">Rank</div>
          <RankBadge rating={p.rating} size="lg" />
          <div className="mt-3 text-xs text-gray-500">Peak {p.peakRating}</div>
          <div className="mt-3 flex gap-1">
            {TIERS.map((x) => (
              <div key={x.name} className={clsx("h-2 flex-1 rounded-full", p.rating >= x.min ? "" : "opacity-20")} style={{ background: x.color }} title={`${x.name} ${x.min}+`} />
            ))}
          </div>
          {t.next && <div className="mt-1 text-[11px] text-gray-500">{t.next.min - p.rating} Elo to {t.next.name}</div>}
        </div>
        <div className="card p-5">
          <div className="label">Level {lvl.level}</div>
          <div className="text-3xl font-black text-white">{p.xp} XP</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950">
            <div className="h-full bg-gradient-to-r from-gold-400 to-ember-500" style={{ width: `${(lvl.into / lvl.needed) * 100}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div><b className="text-emerald-400">{p.wins}</b> W</div>
            <div><b className="text-rose-400">{p.losses}</b> L</div>
            <div><b className="text-amber-300">{p.draws}</b> D</div>
          </div>
        </div>
        <div className="card p-5">
          <div className="label">Daily streak</div>
          <div className="text-3xl font-black text-orange-300">🔥 {p.streak}</div>
          <div className="text-xs text-gray-500">best {p.bestStreak}</div>
          <div className="mt-3 flex gap-1">
            {days.map((d) => {
              const r = p.daily[d];
              return <div key={d} title={d} className={clsx("h-6 flex-1 rounded", !r ? "bg-white/5" : r.verdict === "victory" ? "bg-emerald-500/70" : r.verdict === "draw" ? "bg-amber-400/70" : "bg-rose-500/60")} />;
            })}
          </div>
          <div className="mt-1 text-[10px] text-gray-500">last 14 days</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="label">Badges · {Object.keys(p.badges).length}/{BADGES.length}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {BADGES.map((b) => {
            const got = p.badges[b.id];
            return (
              <div key={b.id} className={clsx("rounded-xl border p-3 text-center", got ? "border-gold-400/30 bg-gold-400/5" : "border-white/5 opacity-40 grayscale")} title={b.description}>
                <div className="text-3xl">{b.emoji}</div>
                <div className="mt-1 text-sm font-bold text-white">{b.name}</div>
                <div className="text-[11px] text-gray-400">{b.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <div className="label">Battle log</div>
        {p.log.length === 0 ? (
          <p className="text-sm text-gray-500">No battles yet. The arena awaits.</p>
        ) : (
          <div className="divide-y divide-white/5 text-sm">
            {p.log.slice(0, 30).map((l, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <span className={clsx("w-16 text-xs font-bold", l.verdict === "victory" ? "text-emerald-400" : l.verdict === "draw" ? "text-amber-300" : "text-rose-400")}>{l.verdict.toUpperCase()}</span>
                <span className="flex-1 text-gray-300">{name(l.bossId)}</span>
                <span className="text-xs text-gray-500">{Math.round(l.playerScore * 100)}% vs {Math.round(l.championScore * 100)}%</span>
                <span className={clsx("w-12 text-right text-xs", l.ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {l.ratingDelta >= 0 ? "+" : ""}
                  {l.ratingDelta}
                </span>
                <span className="w-14 text-right text-xs text-gold-300">+{l.xp} XP</span>
                {l.live && <span className="chip text-[10px] text-emerald-300">live</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <button
          className="btn-danger text-xs"
          onClick={() => {
            if (confirm("Reset all arena progress (rating, XP, badges, streaks, votes)?")) {
              progressStore.reset();
              leaderboardStore.reset();
            }
          }}
        >
          Reset progress
        </button>
      </div>
    </div>
  );
}
