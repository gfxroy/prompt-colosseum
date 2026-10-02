import { hash53, rng } from "../hash";
import { BOSSES, EXTRA_CASES, type Boss } from "./bosses";
import type { BattleResult } from "./battle";
import { cellScore } from "./battle";

export const LAUNCH_DAY = "2026-10-01";

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const duelNumber = (day: string) => Math.max(1, Math.round((Date.parse(day) - Date.parse(LAUNCH_DAY)) / 86_400_000) + 1);

const TWISTS: { id: string; label: string; families: Boss["family"][]; apply: (b: Boss) => Boss }[] = [
  {
    id: "haiku-budget",
    label: "Twist: every answer must be under 25 words",
    families: ["guard", "safety", "pii", "rag"],
    apply: (b) => ({ ...b, cases: b.cases.map((c) => ({ ...c, assert: [...c.assert, { type: "length", max: 25, unit: "words" }] })) }),
  },
  {
    id: "no-apology",
    label: "Twist: the word \"unfortunately\" is banned",
    families: ["support", "pii", "safety"],
    apply: (b) => ({ ...b, cases: b.cases.map((c) => ({ ...c, assert: [...c.assert, { type: "icontains", value: "unfortunately", not: true }] })) }),
  },
  { id: "classic", label: "No twist - classic rules", families: ["classify", "extract", "summarize", "support", "rag", "guard", "pii", "safety"], apply: (b) => b },
];

/** Same challenge for everyone on a given UTC day. */
export function dailyBoss(day = dayKey()): Boss & { twist: string; duel: number } {
  const r = rng(hash53(`colosseum-daily-${day}`));
  const base = BOSSES[Math.floor(r() * BOSSES.length)];
  const pool = [...base.cases, ...(EXTRA_CASES[base.family] ?? [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cases = pool.slice(0, Math.min(6, pool.length));
  const twists = TWISTS.filter((t) => t.families.includes(base.family));
  const twist = twists[Math.floor(r() * twists.length)];
  const boss = twist.apply({ ...base, cases });
  return {
    ...boss,
    id: `daily-${day}`,
    rating: 1150 + Math.floor(r() * 4) * 100,
    title: `${base.title} · Daily Duel`,
    visible: 1,
    twist: twist.label,
    duel: duelNumber(day),
  };
}

export function emojiRow(result: BattleResult, who: "player" | "champion" = "player"): string {
  return result.rounds
    .map((r) => {
      const s = cellScore(who === "player" ? r.player : r.champion);
      return s >= 0.999 ? "🟩" : s > 0 ? "🟨" : "🟥";
    })
    .join("");
}

export function shareText(opts: { result: BattleResult; bossName: string; mode: "campaign" | "daily" | "practice"; day?: string; level?: number; rating: number; tier: string; delta: number; streak: number; url: string }): string {
  const { result } = opts;
  const verdict = result.verdict === "victory" ? "VICTORY 👍" : result.verdict === "draw" ? "DRAW 🤝" : "DEFEAT 👎";
  const title =
    opts.mode === "daily" ? `Daily Duel #${duelNumber(opts.day ?? dayKey())}` : opts.mode === "campaign" ? `Campaign Lv ${opts.level ?? "?"}` : "Practice";
  const lines = [
    `🏛️ Prompt Colosseum · ${title}`,
    `⚔️ vs ${opts.bossName} - ${verdict}`,
    `You  ${emojiRow(result, "player")} ${Math.round(result.playerHp)} HP`,
    `Boss ${emojiRow(result, "champion")} ${Math.round(result.bossHp)} HP`,
    `${opts.tier} · Elo ${opts.rating} (${opts.delta >= 0 ? "+" : ""}${opts.delta})${opts.streak > 1 ? ` · 🔥${opts.streak}` : ""}${result.live ? " · ⚡live model" : ""}`,
    opts.url,
  ];
  return lines.join("\n");
}
