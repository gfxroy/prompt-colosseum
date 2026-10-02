import { runSuite, type RunEvent } from "../runner";
import type { CellResult, Provider, ProviderConfig, Suite } from "../types";
import type { Boss } from "./bosses";

export interface BattleRound {
  testId: string;
  index: number;
  player: CellResult;
  champion: CellResult;
  /** HP after this round (0-100). */
  playerHp: number;
  bossHp: number;
}

export type Verdict = "victory" | "defeat" | "draw";

export interface BattleResult {
  bossId: string;
  rounds: BattleRound[];
  playerHp: number;
  bossHp: number;
  playerScore: number;
  championScore: number;
  verdict: Verdict;
  live: boolean;
  model: string;
  tokens: number;
  costUsd: number;
}

export interface BattleSpec {
  boss: Pick<Boss, "id" | "name" | "edits" | "fixedTemplate" | "champion" | "cases">;
  playerPrompt: string;
}

export const PLAYER = "you";
export const CHAMPION = "champion";

/** Builds the hidden suite: champion prompt vs your prompt on the boss's cases. */
export function battleSuite(spec: BattleSpec, provider: ProviderConfig): Suite {
  const { boss } = spec;
  const player =
    boss.edits === "system"
      ? { id: PLAYER, label: "Your prompt", system: spec.playerPrompt, template: boss.fixedTemplate ?? "{{input}}" }
      : { id: PLAYER, label: "Your prompt", template: spec.playerPrompt };
  return {
    name: `Battle: ${boss.name}`,
    prompts: [{ id: CHAMPION, label: `${boss.name}'s champion`, ...boss.champion }, player],
    providers: [{ ...provider, temperature: provider.temperature ?? 0 }],
    tests: boss.cases,
    judge: { provider: provider.id },
    settings: { repeats: 1 },
  };
}

/** Partial credit: fraction of (weighted) assertions passed. */
export const cellScore = (c: CellResult) => {
  if (c.error || !c.assertions.length) return c.error ? 0 : 1;
  const total = c.assertions.reduce((a, r) => a + r.weight, 0) || 1;
  return c.assertions.reduce((a, r) => a + (r.pass ? r.weight : 0), 0) / total;
};

/** Each case is worth 100/N HP. Your failures drain your HP; the champion's failures drain the boss. */
export function scoreBattle(boss: Pick<Boss, "id" | "cases">, cells: CellResult[], live: boolean): BattleResult {
  const n = boss.cases.length;
  const per = 100 / n;
  let playerHp = 100;
  let bossHp = 100;
  const rounds: BattleRound[] = [];
  boss.cases.forEach((t, index) => {
    const player = cells.find((c) => c.testId === t.id && c.promptId === PLAYER);
    const champion = cells.find((c) => c.testId === t.id && c.promptId === CHAMPION);
    if (!player || !champion) return;
    playerHp -= per * (1 - cellScore(player));
    bossHp -= per * (1 - cellScore(champion));
    rounds.push({ testId: t.id, index, player, champion, playerHp: Math.max(0, playerHp), bossHp: Math.max(0, bossHp) });
  });
  const ps = rounds.reduce((a, r) => a + cellScore(r.player), 0) / Math.max(1, rounds.length);
  const cs = rounds.reduce((a, r) => a + cellScore(r.champion), 0) / Math.max(1, rounds.length);
  const eps = 1e-9;
  const verdict: Verdict = Math.abs(playerHp - bossHp) < eps ? "draw" : playerHp > bossHp ? "victory" : "defeat";
  const mine = rounds.map((r) => r.player);
  return {
    bossId: boss.id,
    rounds,
    playerHp: Math.max(0, Math.round(playerHp * 10) / 10),
    bossHp: Math.max(0, Math.round(bossHp * 10) / 10),
    playerScore: ps,
    championScore: cs,
    verdict,
    live,
    model: mine[0]?.providerId ?? "",
    tokens: mine.reduce((a, c) => a + c.usage.inputTokens + c.usage.outputTokens, 0),
    costUsd: mine.reduce((a, c) => a + c.costUsd, 0),
  };
}

export async function runBattle(opts: {
  spec: BattleSpec;
  providerConfig: ProviderConfig;
  provider: Provider;
  live: boolean;
  signal?: AbortSignal;
  onEvent?: (e: RunEvent) => void;
  concurrency?: number;
  rpm?: number;
}): Promise<BattleResult> {
  const suite = battleSuite(opts.spec, opts.providerConfig);
  const run = await runSuite({
    suite,
    providers: { [opts.providerConfig.id]: opts.provider },
    concurrency: opts.concurrency ?? 2,
    rpm: opts.rpm,
    signal: opts.signal,
    onEvent: opts.onEvent,
  });
  return scoreBattle(opts.spec.boss, run.cells, opts.live);
}

/** Actionable hints from your failed assertions (works for real models too). */
export function battleHints(result: BattleResult): string[] {
  const seen = new Map<string, string>();
  for (const r of result.rounds)
    for (const a of r.player.assertions) {
      if (a.pass || seen.has(a.type)) continue;
      const reason = a.reason;
      let hint = `${a.type}: ${reason}`;
      if (/code fence/.test(reason)) hint = "Your output was wrapped in a ``` code fence - ask for raw JSON only.";
      else if (a.type === "is-json" || a.type === "json-schema") hint = `JSON check failed (${reason}). Be explicit about the exact output format and types.`;
      else if (a.type === "json-path") hint = `A field had the wrong value (${reason}). Specify formats (numbers, dates, null for missing).`;
      else if (a.type === "equals") hint = `Exact-match failed (${reason}). Constrain the whole output.`;
      else if (a.type === "length") hint = `Length check failed (${reason}). Give a hard budget.`;
      else if (a.type === "not-contains" || a.type === "not-icontains") hint = `Forbidden text appeared (${reason}).`;
      else if (a.type === "not-refusal") hint = "You refused a harmless request - over-defending costs HP too.";
      else if (a.type === "refusal") hint = "A harmful request slipped through - add a rule to decline it.";
      else if (a.type === "no-pii") hint = `Personal data leaked (${reason}).`;
      else if (a.type === "llm-rubric") hint = `The judge was unhappy: ${reason.replace(/^judge [\d.]+ [<≥] [\d.]+: /, "")}`;
      seen.set(a.type, hint);
    }
  return [...seen.values()].slice(0, 4);
}
