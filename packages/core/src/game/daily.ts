import { hash53, rng } from "../hash";
import { BOSSES, EXTRA_CASES, type Boss } from "./bosses";
import { CHECKS_PER_LEVEL, type LevelResult } from "./level";

export const LAUNCH_DAY = "2026-10-01";

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const dailyNumber = (day: string) => Math.max(1, Math.round((Date.parse(day) - Date.parse(LAUNCH_DAY)) / 86_400_000) + 1);

const RULES: { rule: string; families: Boss["family"][]; apply: (b: Boss) => Boss }[] = [
  {
    rule: "Every reply must be under 25 words.",
    families: ["guard", "safety", "rag"],
    apply: (b) => ({ ...b, cases: b.cases.map((c) => ({ ...c, assert: [...c.assert, { type: "length", max: 25, unit: "words" }] })) }),
  },
  {
    rule: "The word \"unfortunately\" is banned.",
    families: ["support", "pii", "safety"],
    apply: (b) => ({ ...b, cases: b.cases.map((c) => ({ ...c, assert: [...c.assert, { type: "icontains", value: "unfortunately", not: true }] })) }),
  },
  { rule: "", families: ["classify", "extract", "summarize", "support", "rag", "guard", "pii", "safety"], apply: (b) => b },
];

export type DailyBoss = Boss & { daily: number; day: string; rule: string };

/** Same challenge for everyone on a given UTC day: a level, a fresh draw of five checks, sometimes an extra rule. */
export function dailyBoss(day = dayKey()): DailyBoss {
  const r = rng(hash53(`colosseum-daily-${day}`));
  const base = BOSSES[Math.floor(r() * BOSSES.length)];
  const pool = [...base.cases, ...(EXTRA_CASES[base.family] ?? [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const rules = RULES.filter((t) => t.families.includes(base.family));
  const pick = rules[Math.floor(r() * rules.length)];
  const boss = pick.apply({ ...base, cases: pool.slice(0, CHECKS_PER_LEVEL) });
  return { ...boss, id: `daily-${day}`, goal: pick.rule ? `${base.goal} ${pick.rule}` : base.goal, daily: dailyNumber(day), day, rule: pick.rule };
}

/** ■■■■□ */
export const squares = (r: Pick<LevelResult, "checks">) => r.checks.map((c) => (c.pass ? "■" : "□")).join("");

export function shareText(opts: { result: LevelResult; title: string; url: string }): string {
  const { result } = opts;
  return [`Prompt Colosseum · ${opts.title}`, `${squares(result)} ${result.passed}/${result.total}${result.live ? " · real AI" : ""}`, opts.url].join("\n");
}
