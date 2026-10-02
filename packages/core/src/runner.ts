import { evaluateAssertion, scoreCase } from "./assertions";
import { render } from "./template";
import { costOf, pricingFor } from "./pricing";
import { suiteHash } from "./suite";
import { HttpError, redact } from "./providers/openai";
import { estimateTokens } from "./providers/mock";
import type { CellResult, ChatMessage, Completion, Embedder, PromptVersion, Provider, RunResult, Suite, TestCase } from "./types";

export type RunEvent =
  | { type: "start"; total: number }
  | { type: "cell-start"; key: string }
  | { type: "cell-done"; cell: CellResult; done: number; total: number }
  | { type: "retry"; key: string; attempt: number; waitMs: number; reason: string }
  | { type: "done"; run: RunResult };

export interface RunOptions {
  suite: Suite;
  providers: Record<string, Provider>;
  promptIds?: string[];
  providerIds?: string[];
  testIds?: string[];
  repeats?: number;
  concurrency?: number;
  /** Requests per minute per provider. */
  rpm?: number;
  judge?: Provider;
  embedder?: Embedder;
  signal?: AbortSignal;
  onEvent?: (e: RunEvent) => void;
  retries?: number;
  backoffBaseMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  runId?: string;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export function buildMessages(prompt: PromptVersion, vars: Record<string, unknown>): { messages: ChatMessage[]; missing: string[] } {
  const messages: ChatMessage[] = [];
  const missing: string[] = [];
  if (prompt.system?.trim()) {
    const r = render(prompt.system, vars);
    messages.push({ role: "system", content: r.text });
    missing.push(...r.missing);
  }
  const u = render(prompt.template, vars);
  messages.push({ role: "user", content: u.text });
  missing.push(...u.missing);
  return { messages, missing: [...new Set(missing)] };
}

export const cellKey = (promptId: string, providerId: string, testId: string, repeat: number) => `${promptId}|${providerId}|${testId}|${repeat}`;
export const columnKey = (promptId: string, providerId: string) => `${promptId}|${providerId}`;

/** Spaces requests so each provider stays under `rpm` (simple, fair, no bursts). */
export class RateLimiter {
  private next = new Map<string, number>();
  constructor(
    private rpm: number,
    private sleep: (ms: number, s?: AbortSignal) => Promise<void> = defaultSleep,
    private now: () => number = () => Date.now(),
  ) {}
  async acquire(key: string, signal?: AbortSignal) {
    if (!this.rpm || this.rpm <= 0) return;
    const interval = 60_000 / this.rpm;
    const t = this.now();
    const slot = Math.max(t, this.next.get(key) ?? 0);
    this.next.set(key, slot + interval);
    if (slot > t) await this.sleep(slot - t, signal);
  }
  /** Push the next slot back (e.g. after a 429 with Retry-After). */
  penalize(key: string, ms: number) {
    this.next.set(key, Math.max(this.next.get(key) ?? 0, this.now() + ms));
  }
}

/** Exponential backoff with jitter; honours Retry-After when the server provides it. */
export function backoffDelay(attempt: number, baseMs: number, retryAfterMs?: number, rand = Math.random): number {
  const exp = baseMs * 2 ** attempt;
  const jittered = exp / 2 + rand() * (exp / 2);
  return Math.min(60_000, Math.max(retryAfterMs ?? 0, jittered));
}

export async function completeWithRetry(
  provider: Provider,
  req: Parameters<Provider["complete"]>[0],
  opts: { retries: number; baseMs: number; sleep: (ms: number, s?: AbortSignal) => Promise<void>; limiter?: RateLimiter; onRetry?: (attempt: number, waitMs: number, reason: string) => void },
): Promise<Completion> {
  for (let attempt = 0; ; attempt++) {
    await opts.limiter?.acquire(provider.id, req.signal);
    try {
      return await provider.complete(req);
    } catch (e) {
      const retryable = e instanceof HttpError ? e.retryable || e.status === 0 : false;
      if (!retryable || attempt >= opts.retries || req.signal?.aborted) throw e;
      const wait = backoffDelay(attempt, opts.baseMs, (e as HttpError).retryAfterMs);
      opts.limiter?.penalize(provider.id, wait);
      opts.onRetry?.(attempt + 1, wait, (e as Error).message);
      await opts.sleep(wait, req.signal);
    }
  }
}

export interface PlannedCell {
  key: string;
  prompt: PromptVersion;
  providerId: string;
  test: TestCase;
  repeat: number;
}

export function planRun(opts: Pick<RunOptions, "suite" | "promptIds" | "providerIds" | "testIds" | "repeats">): PlannedCell[] {
  const { suite } = opts;
  const prompts = suite.prompts.filter((p) => !opts.promptIds || opts.promptIds.includes(p.id));
  const providers = suite.providers.filter((p) => !opts.providerIds || opts.providerIds.includes(p.id));
  const tests = suite.tests.filter((t) => !opts.testIds || opts.testIds.includes(t.id));
  const repeats = Math.max(1, opts.repeats ?? suite.settings?.repeats ?? 1);
  const cells: PlannedCell[] = [];
  for (const test of tests)
    for (const prompt of prompts)
      for (const prov of providers)
        for (let r = 0; r < repeats; r++) cells.push({ key: cellKey(prompt.id, prov.id, test.id, r), prompt, providerId: prov.id, test, repeat: r });
  return cells;
}

/** Rough pre-flight estimate: tokens in, tokens out (assumes ~150 output tokens) and USD. */
export function estimateRun(opts: Pick<RunOptions, "suite" | "promptIds" | "providerIds" | "testIds" | "repeats">) {
  const plan = planRun(opts);
  let inputTokens = 0;
  let outputTokens = 0;
  let usd = 0;
  let judgeCalls = 0;
  for (const c of plan) {
    const vars = { ...(opts.suite.defaults?.vars ?? {}), ...c.test.vars };
    const { messages } = buildMessages(c.prompt, vars);
    const inTok = estimateTokens(messages.map((m) => m.content).join("\n"));
    const outTok = 150;
    inputTokens += inTok;
    outputTokens += outTok;
    const cfg = opts.suite.providers.find((p) => p.id === c.providerId);
    if (cfg) usd += costOf({ inputTokens: inTok, outputTokens: outTok }, pricingFor(cfg));
    judgeCalls += [...c.test.assert, ...(opts.suite.defaults?.assert ?? [])].filter((a) => a.type === "llm-rubric").length;
  }
  return { calls: plan.length, judgeCalls, inputTokens, outputTokens, usd };
}

export async function runSuite(opts: RunOptions): Promise<RunResult> {
  const { suite } = opts;
  const plan = planRun(opts);
  const sleep = opts.sleep ?? defaultSleep;
  const limiter = new RateLimiter(opts.rpm ?? suite.settings?.rpm ?? 0, sleep);
  const concurrency = Math.max(1, opts.concurrency ?? suite.settings?.concurrency ?? 4);
  const retries = opts.retries ?? 4;
  const baseMs = opts.backoffBaseMs ?? 1500;
  const startedAt = new Date().toISOString();
  const cells: CellResult[] = new Array(plan.length);
  let done = 0;
  opts.onEvent?.({ type: "start", total: plan.length });

  const judgeProvider = opts.judge ?? (suite.judge?.provider ? opts.providers[suite.judge.provider] : undefined);
  const judge = judgeProvider
    ? (messages: ChatMessage[]) =>
        completeWithRetry(judgeProvider, { messages, temperature: 0, signal: opts.signal }, { retries, baseMs, sleep, limiter })
    : undefined;

  const runCell = async (c: PlannedCell): Promise<CellResult> => {
    const vars = { ...(suite.defaults?.vars ?? {}), ...c.test.vars };
    const { messages } = buildMessages(c.prompt, vars);
    const provider = opts.providers[c.providerId];
    const cfg = suite.providers.find((p) => p.id === c.providerId);
    const base = { key: c.key, promptId: c.prompt.id, providerId: c.providerId, testId: c.test.id, repeat: c.repeat, messages };
    if (!provider || !cfg) {
      return { ...base, output: "", error: `provider "${c.providerId}" is not configured`, latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, source: "error", assertions: [], score: 0, pass: false };
    }
    opts.onEvent?.({ type: "cell-start", key: c.key });
    let completion: Completion;
    try {
      completion = await completeWithRetry(
        provider,
        { messages, temperature: cfg.temperature, maxTokens: cfg.maxTokens, jsonMode: cfg.jsonMode, seed: c.repeat, signal: opts.signal, meta: { system: c.prompt.system, template: c.prompt.template, vars } },
        { retries, baseMs, sleep, limiter, onRetry: (attempt, waitMs, reason) => opts.onEvent?.({ type: "retry", key: c.key, attempt, waitMs, reason }) },
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      return { ...base, output: "", error: redact((e as Error).message), latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, source: "error", assertions: [], score: 0, pass: false };
    }
    const costUsd = costOf(completion.usage, pricingFor(cfg));
    const specs = [...(suite.defaults?.assert ?? []), ...c.test.assert];
    const assertions = [];
    for (const spec of specs) {
      assertions.push(
        await evaluateAssertion(spec, { output: completion.text, vars, messages, latencyMs: completion.latencyMs, usage: completion.usage, costUsd, judge, embedder: opts.embedder }),
      );
    }
    const { pass, score } = scoreCase(assertions, suite.settings?.threshold ?? 1, suite.settings?.requireAll ?? true);
    return { ...base, output: completion.text, latencyMs: completion.latencyMs, usage: completion.usage, costUsd, source: completion.source, assertions, score, pass };
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < plan.length) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = cursor++;
      const cell = await runCell(plan[idx]);
      cells[idx] = cell;
      done++;
      opts.onEvent?.({ type: "cell-done", cell, done, total: plan.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, worker));

  const run: RunResult = {
    id: opts.runId ?? `run-${Date.now().toString(36)}`,
    suiteName: suite.name,
    suiteHash: suiteHash(suite),
    startedAt,
    finishedAt: new Date().toISOString(),
    promptIds: [...new Set(plan.map((p) => p.prompt.id))],
    providerIds: [...new Set(plan.map((p) => p.providerId))],
    testIds: [...new Set(plan.map((p) => p.test.id))],
    repeats: Math.max(1, opts.repeats ?? suite.settings?.repeats ?? 1),
    cells,
  };
  opts.onEvent?.({ type: "done", run });
  return run;
}
