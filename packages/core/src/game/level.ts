import { runSuite, type RunEvent } from "../runner";
import type { CellResult, Provider, ProviderConfig, Suite } from "../types";
import type { Boss } from "./bosses";

export const CHECKS_PER_LEVEL = 5;

export interface CheckResult {
  id: string;
  label: string;
  pass: boolean;
  /** Why it failed (first failing assertion), empty when passed. */
  reason: string;
  /** Type of the first failing assertion, e.g. "is-json" or "not-refusal". */
  failedType: string;
  output: string;
}

export interface LevelResult {
  bossId: string;
  checks: CheckResult[];
  passed: number;
  total: number;
  won: boolean;
  live: boolean;
  model: string;
}

/**
 * The player writes plain instructions. Any input the level needs (the review, the email, the secret...)
 * that the prompt doesn't reference with {{var}} is attached automatically, so nobody has to learn template syntax.
 */
export function levelPrompt(boss: Pick<Boss, "inputs">, text: string): string {
  const missing = Object.entries(boss.inputs).filter(([v]) => !new RegExp(`{{\\s*${v}\\s*}}`).test(text));
  if (!missing.length) return text;
  return `${text.trimEnd()}\n\n${missing.map(([v, label]) => `${label}:\n{{${v}}}`).join("\n\n")}`;
}

/** Builds the hidden suite for one attempt: your prompt × the level's five checks. */
export function levelSuite(boss: Pick<Boss, "id" | "edits" | "fixedTemplate" | "inputs" | "cases">, text: string, provider: ProviderConfig): Suite {
  const prompt = levelPrompt(boss, text);
  return {
    name: `Level: ${boss.id}`,
    prompts: [boss.edits === "system" ? { id: "you", system: prompt, template: boss.fixedTemplate ?? "{{input}}" } : { id: "you", template: prompt }],
    providers: [{ ...provider, temperature: provider.temperature ?? 0 }],
    tests: boss.cases,
    judge: { provider: provider.id },
    settings: { repeats: 1 },
  };
}

export function toCheck(boss: Pick<Boss, "cases">, cell: CellResult): CheckResult {
  const t = boss.cases.find((c) => c.id === cell.testId);
  const first = cell.assertions.find((a) => !a.pass);
  const reason = cell.pass ? "" : cell.error || first?.reason || "";
  return { id: cell.testId, label: t?.description ?? cell.testId, pass: cell.pass, reason, failedType: cell.pass ? "" : cell.error ? "error" : first?.type ?? "", output: cell.output };
}

export function scoreLevel(boss: Pick<Boss, "id" | "cases">, cells: CellResult[], live: boolean): LevelResult {
  const checks = boss.cases.map((t) => cells.find((c) => c.testId === t.id)).filter((c): c is CellResult => Boolean(c)).map((c) => toCheck(boss, c));
  const passed = checks.filter((c) => c.pass).length;
  return { bossId: boss.id, checks, passed, total: boss.cases.length, won: passed === boss.cases.length && checks.length === boss.cases.length, live, model: cells[0]?.providerId ?? "" };
}

export async function runLevel(opts: {
  boss: Pick<Boss, "id" | "edits" | "fixedTemplate" | "inputs" | "cases">;
  prompt: string;
  providerConfig: ProviderConfig;
  provider: Provider;
  live: boolean;
  signal?: AbortSignal;
  onEvent?: (e: RunEvent) => void;
  concurrency?: number;
  rpm?: number;
}): Promise<LevelResult> {
  const run = await runSuite({
    suite: levelSuite(opts.boss, opts.prompt, opts.providerConfig),
    providers: { [opts.providerConfig.id]: opts.provider },
    concurrency: opts.concurrency ?? 2,
    rpm: opts.rpm,
    signal: opts.signal,
    onEvent: opts.onEvent,
  });
  return scoreLevel(opts.boss, run.cells, opts.live);
}

/** One plain-language nudge based on the first failed check (works for real models too). */
export function levelHint(result: LevelResult): string | null {
  const f = result.checks.find((c) => !c.pass);
  if (!f) return null;
  if (/code fence/.test(f.reason)) return "The reply was wrapped in a code block. Ask for raw JSON only.";
  const hints: Record<string, string> = {
    error: "The request failed. Check your key and try again.",
    "is-json": "The reply wasn't pure JSON. Ask for raw JSON only, nothing before or after it.",
    "json-schema": "The JSON had the wrong shape. Spell out every key and its type.",
    "json-path": "A field had the wrong value. Say how to format numbers and dates, and to use null when something is missing.",
    equals: "The reply had extra words. Say exactly what the whole reply must be.",
    length: "Too long. Give a hard word limit.",
    "contains-all": "Key facts were dropped. Ask it to keep the numbers.",
    icontains: "Something required was missing from the reply.",
    contains: "Something required was missing from the reply.",
    regex: "The format was off. Show it exactly what to include.",
    "not-contains": "Something forbidden slipped into the reply.",
    "not-icontains": "Something forbidden slipped into the reply.",
    refusal: "A harmful request got through. Tell it what to decline.",
    "not-refusal": "It refused something harmless. Tell it to judge intent, not scary words.",
    "no-pii": "Personal data leaked. Forbid sharing anyone's details.",
    "llm-rubric": "The judge wasn't convinced. Describe the reply you want: tone, facts, next step.",
  };
  return hints[f.failedType] ?? null;
}
