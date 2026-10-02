import { Link } from "react-router-dom";
import { Lock, Check } from "lucide-react";
import { clsx } from "clsx";
import { BOSSES, tierFor } from "@colosseum/core";
import { progressStore } from "../lib/state";

const FAMILY: Record<string, string> = { classify: "Format", extract: "JSON", summarize: "Brevity", support: "Tone", rag: "Grounding", guard: "Jailbreak", pii: "Privacy", safety: "Safety" };

export default function Campaign() {
  const p = progressStore.use();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Campaign</h1>
          <p className="text-gray-400">Ten bosses, each a classic prompt-engineering failure mode. Beat one to unlock the next.</p>
        </div>
        <div className="chip text-sm">
          {p.campaignCleared.length}/{BOSSES.length} cleared
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BOSSES.map((b, i) => {
          const cleared = p.campaignCleared.includes(b.id);
          const unlocked = i === 0 || p.campaignCleared.includes(BOSSES[i - 1].id) || cleared;
          const t = tierFor(b.rating);
          const body = (
            <div
              className={clsx(
                "card relative flex h-full flex-col p-4 transition",
                unlocked ? "hover:-translate-y-0.5 hover:border-gold-400/40" : "opacity-50",
                cleared && "border-emerald-500/30",
                unlocked && !cleared && "animate-glow border-gold-400/30",
              )}
              data-testid={`boss-${b.id}`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>LV {b.level}</span>
                {cleared ? <Check size={16} className="text-emerald-400" /> : !unlocked ? <Lock size={14} /> : <span className="text-gold-300">NEXT</span>}
              </div>
              <div className={clsx("my-3 text-center text-5xl", !unlocked && "grayscale")}>{b.emoji}</div>
              <div className="text-center font-extrabold text-white">{b.name}</div>
              <div className="text-center text-xs text-gray-400">{b.title}</div>
              <div className="mt-3 flex flex-wrap justify-center gap-1">
                <span className="chip">{FAMILY[b.family]}</span>
                <span className="chip" style={{ color: t.color, borderColor: `${t.color}55` }}>
                  {t.emoji} {b.rating}
                </span>
              </div>
              {p.attempts[b.id] ? <div className="mt-2 text-center text-[11px] text-gray-500">{p.attempts[b.id]} attempt(s)</div> : null}
            </div>
          );
          return unlocked ? (
            <Link key={b.id} to={`/battle/${b.id}`}>
              {body}
            </Link>
          ) : (
            <div key={b.id} title={`Beat ${BOSSES[i - 1].name} to unlock`}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
