import { clsx } from "clsx";
import { FastForward, X } from "lucide-react";
import type { AssertionResult, Boss } from "@colosseum/core";
import HpBar from "../components/HpBar";
import type { RevealState } from "./useBattle";
import { settingsStore } from "../lib/state";

function AssertionRow({ a }: { a: AssertionResult }) {
  return (
    <div className={clsx("animate-pop flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs", a.pass ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200")}>
      <span className="font-bold">{a.pass ? "✓" : "✗"}</span>
      <span className="font-mono font-semibold">{a.type}</span>
      <span className="line-clamp-2 text-gray-400">{a.reason}</span>
    </div>
  );
}

function Side({ who, emoji, assertions, output, hit }: { who: string; emoji: string; assertions: AssertionResult[]; output?: string; hit: number }) {
  return (
    <div className="card relative min-h-[260px] p-4">
      {hit > 0.01 && (
        <div key={Math.random()} className="animate-float-up pointer-events-none absolute top-2 right-4 text-2xl font-black text-rose-400">
          -{Math.round(hit)}
        </div>
      )}
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-300">
        <span className="text-xl">{emoji}</span> {who}
      </div>
      {output !== undefined && <pre className="mono mb-3 max-h-28 overflow-auto rounded-lg bg-ink-950 p-2 text-xs whitespace-pre-wrap text-gray-400">{output || "(empty)"}</pre>}
      <div className="space-y-1.5">
        {assertions.map((a, i) => (
          <AssertionRow key={i} a={a} />
        ))}
      </div>
    </div>
  );
}

export default function Arena({ boss, reveal, progress, onSkip, onCancel }: { boss: Boss; reveal: RevealState; progress: { done: number; total: number; retry: string }; onSkip: () => void; onCancel: () => void }) {
  const s = settingsStore.use();
  const waiting = reveal.round < 0 || (reveal.playerCell === null && progress.done < progress.total);
  return (
    <div className="space-y-5" data-testid="arena">
      <div className="card p-5">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3">
            <div className={clsx("text-5xl", reveal.hitPlayer > 0.01 && "animate-shake")}>🛡️</div>
            <HpBar hp={reveal.playerHp} label="You" flash={reveal.hitPlayer > 0.01} />
          </div>
          <div className="text-center">
            <div className="gold-text text-2xl font-black">VS</div>
            <div className="text-xs text-gray-500">
              Round {Math.max(1, reveal.round + 1)}/{boss.cases.length}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HpBar hp={reveal.bossHp} label="Boss" align="right" flash={reveal.hitBoss > 0.01} />
            <div className={clsx("text-5xl", reveal.hitBoss > 0.01 && "animate-shake")}>{boss.emoji}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-center gap-1.5">
          {boss.cases.map((c, i) => {
            const l = reveal.log[i];
            const color = !l ? "bg-white/10" : l.player >= 0.999 ? "bg-emerald-400" : l.player > 0 ? "bg-amber-400" : "bg-rose-500";
            return <div key={c.id} className={clsx("h-2.5 w-8 rounded-full transition-colors", color, i === reveal.round && !l && "animate-pulse bg-gold-400/60")} title={c.id} />;
          })}
        </div>
      </div>

      <div className="text-center">
        <span className="chip font-mono text-sm" data-testid="round-case">
          {reveal.testId ? `⚔️ ${reveal.testId}` : "Gladiators entering…"}
        </span>
        {waiting && (
          <div className="mt-2 text-xs text-gray-500">
            {progress.retry || `Model is answering… ${progress.done}/${progress.total} responses`}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Side who="Your prompt" emoji="🛡️" assertions={reveal.player} output={reveal.playerCell?.error ?? reveal.playerCell?.output} hit={reveal.hitPlayer} />
        <Side who={`${boss.name}'s champion`} emoji={boss.emoji} assertions={reveal.champion} output={reveal.championCell?.error ?? reveal.championCell?.output} hit={reveal.hitBoss} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {[1, 2, 4].map((sp) => (
          <button key={sp} className={clsx("btn-ghost px-3 py-1 text-xs", s.speed === sp && "border-gold-400/50 text-gold-300")} onClick={() => settingsStore.set((x) => ({ ...x, speed: sp as 1 | 2 | 4 }))}>
            {sp}×
          </button>
        ))}
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onSkip} data-testid="skip">
          <FastForward size={13} /> Skip to verdict
        </button>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onCancel}>
          <X size={13} /> Retreat
        </button>
      </div>
    </div>
  );
}
