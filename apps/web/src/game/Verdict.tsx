import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Copy, Download, RotateCcw, ArrowRight, Lightbulb, Check, ChevronDown, Linkedin, Twitter } from "lucide-react";
import { battleHints, cellScore, emojiRow, shareText, tierFor, levelFor, type ApplyOutcome, type BattleResult, type Boss } from "@colosseum/core";
import { renderShareCard } from "../lib/shareCard";
import { copyText, downloadBlob } from "../lib/download";
import { useCountUp } from "../lib/useCountUp";

const SITE = "https://gfxroy.github.io/prompt-colosseum/";

function Crowd({ verdict }: { verdict: BattleResult["verdict"] }) {
  const e = verdict === "victory" ? "👍" : verdict === "draw" ? "🤷" : "👎";
  return (
    <div className="flex justify-center gap-1 text-2xl md:text-3xl" aria-label={`crowd: ${e}`}>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="animate-bob inline-block" style={{ animationDelay: `${(i % 5) * 0.15}s` }}>
          {e}
        </span>
      ))}
    </div>
  );
}

export default function Verdict({
  boss,
  result,
  outcome,
  mode,
  day,
  onRematch,
  nextHref,
}: {
  boss: Boss;
  result: BattleResult;
  outcome: ApplyOutcome;
  mode: "campaign" | "daily";
  day?: string;
  onRematch: () => void;
  nextHref: string | null;
}) {
  const p = outcome.progress;
  const tier = tierFor(p.rating);
  const score = useCountUp(Math.round(result.playerScore * 100), 1200);
  const champ = useCountUp(Math.round(result.championScore * 100), 1200);
  const xp = useCountUp(outcome.xp, 1400);
  const elo = useCountUp(p.rating, 1400);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const hints = battleHints(result);
  const heading = mode === "daily" ? `Daily Duel #${"duel" in boss ? (boss as Boss & { duel: number }).duel : ""} · ${day}` : `Campaign · Level ${boss.level}`;
  const text = shareText({ result, bossName: boss.name, mode, day, level: boss.level, rating: p.rating, tier: `${tier.emoji} ${tier.name} ${tier.division}`.trim(), delta: outcome.ratingDelta, streak: p.streak, url: SITE });
  const canvas = useMemo(
    () => renderShareCard({ result, bossName: boss.name, bossEmoji: boss.emoji, heading, rating: p.rating, delta: outcome.ratingDelta, tier: `${tier.name} ${tier.division}`.trim(), tierColor: tier.color, streak: p.streak, url: SITE }),
    [result, boss, heading, p.rating, p.streak, outcome.ratingDelta, tier],
  );
  const [png, setPng] = useState<string>("");
  useEffect(() => {
    setPng(canvas.toDataURL("image/png"));
  }, [canvas]);
  const v = result.verdict;
  const lvl = levelFor(p.xp);
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE)}`;

  return (
    <div className="space-y-6" data-testid="verdict">
      <div className={clsx("card relative overflow-hidden p-8 text-center", v === "victory" ? "border-emerald-400/30" : v === "draw" ? "border-amber-400/30" : "border-rose-500/30")}>
        <div className="text-sm font-bold tracking-widest text-gray-500 uppercase">{heading}</div>
        <div
          className={clsx("animate-slam mt-2 text-6xl font-black md:text-8xl", v === "victory" ? "text-emerald-400" : v === "draw" ? "text-amber-300" : "text-rose-500")}
          data-testid="verdict-title"
        >
          {v === "victory" ? "VICTORY" : v === "draw" ? "DRAW" : "DEFEAT"}
        </div>
        <div className="mt-3 text-gray-300">
          <span className="text-2xl">{boss.emoji}</span> <span className="italic">“{v === "victory" ? boss.defeatLine : v === "draw" ? "We are… evenly matched." : boss.victoryLine}”</span>
        </div>
        <div className="mt-5">
          <Crowd verdict={v} />
        </div>
        <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-3xl font-black text-white tabular-nums">{score}%</div>
            <div className="text-[11px] font-bold text-gray-500 uppercase">your score</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-3xl font-black text-gray-300 tabular-nums">{champ}%</div>
            <div className="text-[11px] font-bold text-gray-500 uppercase">champion</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="gold-text text-3xl font-black tabular-nums">+{xp}</div>
            <div className="text-[11px] font-bold text-gray-500 uppercase">XP · lv {lvl.level}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-3xl font-black tabular-nums" style={{ color: tier.color }}>
              {elo}
            </div>
            <div className={clsx("text-[11px] font-bold uppercase", outcome.ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400")}>
              Elo {outcome.ratingDelta >= 0 ? "+" : ""}
              {outcome.ratingDelta} · {tier.name} {tier.division}
            </div>
          </div>
        </div>
        {tier.next && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>{tier.name}</span>
              <span>
                {tier.next.name} at {tier.next.min}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-950">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${tier.progress * 100}%`, background: tier.color }} />
            </div>
          </div>
        )}
        {(outcome.newBadges.length > 0 || outcome.firstClear || outcome.leveledUp) && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {outcome.firstClear && <span className="chip animate-pop border-emerald-400/40 text-emerald-300">🏆 First clear!</span>}
            {outcome.leveledUp && <span className="chip animate-pop border-gold-400/40 text-gold-300">⬆️ Level up! Lv {lvl.level}</span>}
            {outcome.newBadges.map((b) => (
              <span key={b.id} className="chip animate-pop border-gold-400/40 text-gold-300" title={b.description}>
                {b.emoji} {b.name}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn-ghost" onClick={onRematch} data-testid="rematch">
            <RotateCcw size={16} /> {v === "victory" ? "Improve your prompt" : "Rematch"}
          </button>
          {nextHref && (
            <Link to={nextHref} className="btn-gold">
              Next boss <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5" data-testid="share-card">
          <div className="label">Share your result</div>
          <pre className="mono rounded-xl bg-ink-950 p-3 text-sm whitespace-pre-wrap text-gray-200" data-testid="share-text">
            {text}
          </pre>
          {png && <img src={png} alt="Share card preview" className="mt-3 w-full rounded-xl border border-white/10" data-testid="share-png" />}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-gold"
              onClick={async () => {
                setCopied(await copyText(text));
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied!" : "Copy text"}
            </button>
            <button className="btn-ghost" onClick={() => canvas.toBlob((b) => b && downloadBlob(`prompt-colosseum-${boss.id}.png`, b))}>
              <Download size={15} /> PNG card
            </button>
            <a className="btn-ghost" href={tweet} target="_blank" rel="noreferrer">
              <Twitter size={15} /> Post on X
            </a>
            <a className="btn-ghost" href={linkedin} target="_blank" rel="noreferrer">
              <Linkedin size={15} /> LinkedIn
            </a>
          </div>
        </div>

        <div className="space-y-6">
          {v !== "victory" && hints.length > 0 && (
            <div className="card border-amber-400/20 p-5">
              <div className="label flex items-center gap-1.5 text-amber-300">
                <Lightbulb size={13} /> Scout report
              </div>
              <ul className="space-y-2 text-sm text-gray-300">
                {hints.map((h) => (
                  <li key={h}>• {h}</li>
                ))}
              </ul>
            </div>
          )}
          {(v === "victory" || (p.attempts[boss.id] ?? 0) >= 3) && (
            <div className="card p-5">
              <button className="flex w-full items-center justify-between" onClick={() => setShowSolution((s) => !s)}>
                <span className="label !mb-0">{v === "victory" ? "Compare with a reference prompt" : "Stuck? Peek at a reference prompt"}</span>
                <ChevronDown size={16} className={clsx("text-gray-400 transition", showSolution && "rotate-180")} />
              </button>
              {showSolution && <pre className="mono mt-3 rounded-xl bg-ink-950 p-3 text-xs whitespace-pre-wrap text-gray-300">{boss.solution}</pre>}
            </div>
          )}
          <div className="card p-5">
            <div className="label">Round by round</div>
            <div className="mb-2 font-mono text-lg tracking-widest">
              <div>you&nbsp; {emojiRow(result)}</div>
              <div>boss {emojiRow(result, "champion")}</div>
            </div>
            <div className="divide-y divide-white/5">
              {result.rounds.map((r, i) => (
                <div key={r.testId} className="py-2">
                  <button className="flex w-full items-center justify-between text-left text-sm" onClick={() => setOpen(open === i ? null : i)}>
                    <span className="font-mono text-gray-300">{r.testId}</span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className={cellScore(r.player) >= 0.999 ? "text-emerald-400" : "text-rose-400"}>you {Math.round(cellScore(r.player) * 100)}%</span>
                      <span className="text-gray-500">boss {Math.round(cellScore(r.champion) * 100)}%</span>
                      <ChevronDown size={14} className={clsx("text-gray-500 transition", open === i && "rotate-180")} />
                    </span>
                  </button>
                  {open === i && (
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {[
                        ["You", r.player],
                        ["Champion", r.champion],
                      ].map(([label, c]) => {
                        const cell = c as typeof r.player;
                        return (
                          <div key={label as string} className="rounded-lg bg-ink-950 p-2">
                            <div className="mb-1 text-[11px] font-bold text-gray-500 uppercase">{label as string}</div>
                            <pre className="mono max-h-40 overflow-auto text-[11px] whitespace-pre-wrap text-gray-400">{cell.error ?? cell.output}</pre>
                            <div className="mt-1 space-y-0.5">
                              {cell.assertions.map((a, j) => (
                                <div key={j} className={clsx("text-[11px]", a.pass ? "text-emerald-300" : "text-rose-300")}>
                                  {a.pass ? "✓" : "✗"} {a.type}: <span className="text-gray-500">{a.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-gray-500">
              Model: {result.live ? <b className="text-emerald-300">live · {result.model}</b> : <b>mock-1 simulator (demo)</b>} · {result.tokens.toLocaleString()} tokens
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
