import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  BOSSES,
  bossById,
  compareColumns,
  createProvider,
  estimateRun,
  isLive,
  MockProvider,
  parseSuite,
  RecordingProvider,
  runBattle,
  runSuite,
  summarizeRun,
  toJUnit,
  toMarkdown,
  validateSuite,
  normalizeSuite,
  emojiRow,
  battleHints,
  columnKey,
  SuiteError,
  type Comparison,
  type Provider,
  type ProviderConfig,
  type ProviderKeys,
  type Recordings,
  type RunResult,
  type Suite,
} from "@colosseum/core";
import YAML from "yaml";
import { c } from "./ansi";

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: Record<string, string | undefined>;
  cwd: string;
  fetchImpl?: typeof fetch;
}

const HELP = `${c.bold("colosseum")} ${VERSION} - unit tests for prompts

${c.bold("Usage")}
  colosseum run <suite.yaml> [options]      Run a suite (prompts × providers × cases)
  colosseum validate <suite.yaml>           Check a suite for errors
  colosseum compare <base.json> <head.json> Diff two saved runs, flag regressions
  colosseum init [file]                     Write a starter suite
  colosseum bosses                          List Prompt Battle bosses
  colosseum battle <boss-id> -p prompt.txt  Fight a boss from your terminal

${c.bold("Run options")}
  --provider <ids>     Only these provider ids (comma-separated)
  --prompt <ids>       Only these prompt ids
  --test <ids>         Only these test ids
  --repeats <n>        Repeat each cell n times (flakiness detection)
  --concurrency <n>    Parallel requests (default: suite or 4)
  --rpm <n>            Max requests/minute per provider
  --mock               Run every provider with the deterministic mock (no keys, no cost)
  --baseline <file>    Compare against a previous --json result; fail on regressions
  --compare <a,b>      Compare prompt a vs prompt b inside this run
  --fail-on <mode>     regression | failure | none (default: regression with a baseline, else failure)
  --json <file>        Write full results JSON (use as a future baseline)
  --junit <file>       Write JUnit XML
  --md <file>          Write a Markdown summary (also auto-appended to $GITHUB_STEP_SUMMARY)
  --record <file>      Save live responses as replayable recordings
  --yes                Skip the cost confirmation for large live runs

${c.bold("Keys")} (env): OPENAI_API_KEY, GEMINI_API_KEY (or GOOGLE_API_KEY), COLOSSEUM_API_KEY,
       or per provider via ${c.cyan("apiKeyEnv:")} in the suite. Keys are never printed.
`;

function keysFromEnv(env: Io["env"], suite: Suite): ProviderKeys {
  const keys: ProviderKeys = { openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY, compatible: {} };
  for (const p of suite.providers) {
    const custom = p.apiKeyEnv ? env[p.apiKeyEnv] : undefined;
    if (p.type === "openai-compatible") keys.compatible![p.id] = custom ?? env.COLOSSEUM_API_KEY ?? "";
    else if (custom && p.type === "openai") keys.openai = custom;
    else if (custom && p.type === "gemini") keys.gemini = custom;
  }
  return keys;
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
const ids = (v: unknown) => (typeof v === "string" && v ? v.split(",").map((s) => s.trim()) : undefined);

function readSuite(path: string, io: Io): Suite {
  const full = resolve(io.cwd, path);
  if (!existsSync(full)) throw new UsageError(`suite not found: ${path}`);
  return parseSuite(readFileSync(full, "utf8"));
}

class UsageError extends Error {}

function write(io: Io, path: string, content: string) {
  const full = resolve(io.cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function printSummary(io: Io, run: RunResult) {
  const rows = summarizeRun(run);
  io.out("");
  io.out(c.bold(`  ${"prompt".padEnd(18)} ${"provider".padEnd(22)} pass  ✓   ✗   ~   p50ms   cost`));
  for (const r of rows) {
    const color = r.passRate === 1 ? c.green : r.passRate >= 0.5 ? c.yellow : c.red;
    const src = Object.keys(r.sources).join("+");
    io.out(
      `  ${r.promptId.padEnd(18)} ${r.providerId.padEnd(22)} ${color(pct(r.passRate))} ${String(r.passed).padStart(3)} ${String(r.failed + r.errors).padStart(3)} ${String(r.flaky).padStart(3)} ${String(Math.round(r.latencyP50)).padStart(7)} $${r.costUsd.toFixed(5)} ${c.dim(src)}`,
    );
  }
}

function printFailures(io: Io, run: RunResult, limit = 12) {
  const failed = run.cells.filter((x) => !x.pass);
  if (!failed.length) return;
  io.out("");
  io.out(c.bold("  Failures"));
  for (const f of failed.slice(0, limit)) {
    const why = f.error ?? f.assertions.filter((a) => !a.pass).map((a) => `${a.type}: ${a.reason}`).join(" | ");
    io.out(`  ${c.red("✗")} ${f.testId} ${c.dim(`[${f.promptId} @ ${f.providerId}${run.repeats > 1 ? ` #${f.repeat + 1}` : ""}]`)} ${why.slice(0, 200)}`);
  }
  if (failed.length > limit) io.out(c.dim(`  … and ${failed.length - limit} more`));
}

function printComparison(io: Io, cmp: Comparison) {
  io.out("");
  const bad = cmp.regressions.length > 0;
  io.out(`  ${bad ? c.red("▼ REGRESSION") : c.green("▲ OK")} ${cmp.headline}`);
  for (const r of cmp.regressions) io.out(`    ${c.red("✗")} ${r.testId} ${c.dim(`${r.before?.status} → ${r.after?.status}`)}`);
  for (const r of cmp.fixes) io.out(`    ${c.green("✓")} ${r.testId} ${c.dim(`${r.before?.status} → ${r.after?.status}`)}`);
}

async function cmdRun(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      provider: { type: "string" },
      prompt: { type: "string" },
      test: { type: "string" },
      repeats: { type: "string" },
      concurrency: { type: "string" },
      rpm: { type: "string" },
      mock: { type: "boolean" },
      baseline: { type: "string" },
      compare: { type: "string" },
      "fail-on": { type: "string" },
      json: { type: "string" },
      junit: { type: "string" },
      md: { type: "string" },
      record: { type: "string" },
      yes: { type: "boolean" },
      quiet: { type: "boolean" },
    },
  });
  if (!positionals[0]) throw new UsageError("run needs a suite file");
  const suite = readSuite(positionals[0], io);
  const keys = keysFromEnv(io.env, suite);
  const providerIds = ids(values.provider);
  const chosen = suite.providers.filter((p) => !providerIds || providerIds.includes(p.id));
  if (!chosen.length) throw new UsageError(`no providers match --provider ${values.provider}`);
  const recordings: Recordings = {};
  const providers: Record<string, Provider> = {};
  const missing: string[] = [];
  for (const cfg of chosen) {
    if (values.mock || cfg.type === "mock") {
      providers[cfg.id] = new MockProvider(cfg.id, { model: cfg.type === "mock" ? cfg.model : "mock-1" });
      continue;
    }
    if (!isLive(cfg, keys)) {
      missing.push(`${cfg.id} (${cfg.apiKeyEnv ?? { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", "openai-compatible": "COLOSSEUM_API_KEY", mock: "" }[cfg.type]})`);
      continue;
    }
    const p = createProvider(cfg, { keys, fetchImpl: io.fetchImpl });
    providers[cfg.id] = values.record ? new RecordingProvider(p, recordings) : p;
  }
  if (missing.length) throw new UsageError(`missing API key for: ${missing.join(", ")}. Set the env var, use --provider to pick others, or --mock.`);
  let judge: Provider | undefined;
  const judgeCfg = suite.judge?.provider ? suite.providers.find((p) => p.id === suite.judge!.provider) : undefined;
  if (judgeCfg) {
    if (providers[judgeCfg.id] && !(providers[judgeCfg.id] instanceof RecordingProvider)) judge = providers[judgeCfg.id];
    else if (values.mock || judgeCfg.type === "mock") judge = new MockProvider(judgeCfg.id);
    else if (isLive(judgeCfg, keys)) judge = createProvider(judgeCfg, { keys, fetchImpl: io.fetchImpl });
    else {
      judge = new MockProvider(judgeCfg.id);
      io.err(c.yellow(`  ! no key for judge "${judgeCfg.id}" - llm-rubric falls back to the mock judge`));
    }
    if (values.record && judge && !(judge instanceof MockProvider)) judge = new RecordingProvider(judge, recordings);
  }
  const repeats = values.repeats ? Number(values.repeats) : undefined;
  const plan = { suite, promptIds: ids(values.prompt), providerIds: chosen.map((p) => p.id), testIds: ids(values.test), repeats };
  const est = estimateRun(plan);
  const live = chosen.some((p) => !values.mock && p.type !== "mock");
  if (!values.quiet) {
    io.out(`${c.bold("🏛️  Prompt Colosseum")} ${c.dim(VERSION)} · ${suite.name}`);
    io.out(c.dim(`  ${est.calls} calls${est.judgeCalls ? ` + ${est.judgeCalls} judge calls` : ""} · ~${est.inputTokens.toLocaleString()} input tokens · est. $${est.usd.toFixed(4)} · ${live ? "LIVE" : "mock"}`));
  }
  if (live && est.usd > 1 && !values.yes) throw new UsageError(`estimated cost $${est.usd.toFixed(2)} exceeds $1 - re-run with --yes to confirm`);

  let lastLine = 0;
  const run = await runSuite({
    ...plan,
    providers,
    judge,
    concurrency: values.concurrency ? Number(values.concurrency) : undefined,
    rpm: values.rpm ? Number(values.rpm) : undefined,
    onEvent: (e) => {
      if (values.quiet) return;
      if (e.type === "retry") io.err(c.yellow(`  ↻ ${e.key} retry ${e.attempt} in ${Math.round(e.waitMs / 1000)}s (${e.reason.slice(0, 80)})`));
      if (e.type === "cell-done" && (e.done === e.total || Date.now() - lastLine > 400)) {
        lastLine = Date.now();
        io.out(c.dim(`  [${String(e.done).padStart(String(e.total).length)}/${e.total}] ${e.cell.pass ? c.green("✓") : c.red("✗")} ${e.cell.testId} · ${e.cell.promptId} @ ${e.cell.providerId}`));
      }
    },
  });

  let comparison: Comparison | null = null;
  if (values.baseline) {
    const base = JSON.parse(readFileSync(resolve(io.cwd, values.baseline), "utf8")) as RunResult;
    const comparisons = summarizeRun(run).map((s) => compareColumns(base, s.column, run, s.column));
    comparison = comparisons.reduce((acc, cur) => ({
      ...cur,
      regressions: [...acc.regressions, ...cur.regressions],
      fixes: [...acc.fixes, ...cur.fixes],
      flaky: [...acc.flaky, ...cur.flaky],
      changes: [...acc.changes, ...cur.changes],
      headline: [acc.headline, cur.headline].filter(Boolean).join(" | "),
    }));
    const totalReg = comparisons.reduce((a, x) => a + x.regressions.length, 0);
    comparison.headline = totalReg ? comparisons.filter((x) => x.regressions.length).map((x) => x.headline).join(" | ") : "No regressions vs baseline";
  } else if (values.compare) {
    const [a, b] = values.compare.split(",").map((s) => s.trim());
    const cmps = run.providerIds.map((pid) => compareColumns(run, columnKey(a, pid), run, columnKey(b, pid)));
    comparison = { ...cmps[0], regressions: cmps.flatMap((x) => x.regressions), fixes: cmps.flatMap((x) => x.fixes), headline: cmps.map((x) => x.headline).join(" | ") };
  }

  if (!values.quiet) {
    printSummary(io, run);
    printFailures(io, run);
    if (comparison) printComparison(io, comparison);
  }
  const md = toMarkdown(run, comparison);
  if (values.json) write(io, values.json, JSON.stringify(run, null, 2));
  if (values.junit) write(io, values.junit, toJUnit(run));
  if (values.md) write(io, values.md, md);
  if (values.record) {
    const path = resolve(io.cwd, values.record);
    const prev = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Recordings) : {};
    write(io, values.record, JSON.stringify({ ...prev, ...recordings }, null, 1));
    if (!values.quiet) io.out(c.dim(`  recorded ${Object.keys(recordings).length} responses → ${values.record}`));
  }
  if (io.env.GITHUB_STEP_SUMMARY) appendFileSync(io.env.GITHUB_STEP_SUMMARY, md + "\n");

  const failOn = values["fail-on"] ?? (comparison ? "regression" : "failure");
  const anyFail = run.cells.some((x) => !x.pass);
  const regressed = Boolean(comparison?.regressions.length);
  const code = failOn === "none" ? 0 : failOn === "regression" ? (regressed ? 1 : 0) : anyFail || regressed ? 1 : 0;
  if (!values.quiet) io.out("\n" + (code ? c.red(c.bold("  ✗ FAILED")) : c.green(c.bold("  ✓ PASSED"))) + c.dim(` (fail-on: ${failOn})`));
  return code;
}

function cmdValidate(args: string[], io: Io): number {
  const path = args[0];
  if (!path) throw new UsageError("validate needs a suite file");
  const text = readFileSync(resolve(io.cwd, path), "utf8");
  const suite = normalizeSuite(text.trim().startsWith("{") ? JSON.parse(text) : YAML.parse(text));
  const issues = validateSuite(suite);
  for (const i of issues) io.out(`${i.severity === "error" ? c.red("error") : c.yellow("warn ")} ${i.path}: ${i.message}`);
  const errors = issues.filter((i) => i.severity === "error").length;
  io.out(errors ? c.red(`✗ ${errors} error(s)`) : c.green(`✓ ${suite.name}: ${suite.prompts.length} prompts × ${suite.providers.length} providers × ${suite.tests.length} cases`));
  return errors ? 1 : 0;
}

function cmdCompare(args: string[], io: Io): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { "fail-on": { type: "string" }, md: { type: "string" } } });
  if (positionals.length < 2) throw new UsageError("compare needs <base.json> <head.json>");
  const [base, head] = positionals.map((p) => JSON.parse(readFileSync(resolve(io.cwd, p), "utf8")) as RunResult);
  let regressions = 0;
  for (const s of summarizeRun(head)) {
    const cmp = compareColumns(base, s.column, head, s.column);
    io.out(c.bold(`\n${s.column.replace("|", " @ ")}`) + c.dim(`  ${pct(cmp.passRateBefore)} → ${pct(cmp.passRateAfter)}`));
    printComparison(io, cmp);
    regressions += cmp.regressions.length;
  }
  return values["fail-on"] === "none" ? 0 : regressions ? 1 : 0;
}

const STARTER = `# Prompt Colosseum suite - run with: colosseum run suite.yaml --mock
name: Sentiment classifier
prompts:
  - id: v1
    template: |
      Classify the sentiment of this review as positive, negative or neutral.
      {{review}}
  - id: v2
    template: |
      Classify the sentiment of the review as positive, negative or neutral.
      Respond with only the label, in lowercase.
      Review: {{review}}
providers:
  - id: mock
    type: mock
    model: mock-1
  # - id: gpt
  #   type: openai
  #   model: gpt-4.1-mini
  # - id: gemini
  #   type: gemini
  #   model: gemini-3.5-flash-lite
tests:
  - id: happy
    vars: { review: "Absolutely love it, fast and friendly!" }
    assert:
      - { type: equals, value: positive, ignore_case: true }
  - id: angry
    vars: { review: "Arrived broken. Total waste of money." }
    assert:
      - { type: equals, value: negative, ignore_case: true }
`;

async function cmdBattle(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { prompt: { type: "string", short: "p" }, provider: { type: "string" }, model: { type: "string" } } });
  const boss = bossById(positionals[0] ?? "");
  if (!boss) throw new UsageError(`unknown boss. Try: ${BOSSES.map((b) => b.id).join(", ")}`);
  if (!values.prompt) throw new UsageError("battle needs --prompt <file> (your prompt text)");
  const playerPrompt = readFileSync(resolve(io.cwd, values.prompt), "utf8");
  const type = (values.provider ?? "mock") as ProviderConfig["type"];
  const cfg: ProviderConfig = { id: type, type, model: values.model ?? (type === "gemini" ? "gemini-3.5-flash-lite" : type === "openai" ? "gpt-4.1-mini" : "mock-1") };
  const keys: ProviderKeys = { openai: io.env.OPENAI_API_KEY, gemini: io.env.GEMINI_API_KEY ?? io.env.GOOGLE_API_KEY };
  if (type !== "mock" && !isLive(cfg, keys)) throw new UsageError(`missing API key for ${type}`);
  const provider = type === "mock" ? new MockProvider("mock") : createProvider(cfg, { keys, fetchImpl: io.fetchImpl });
  io.out(`${boss.emoji}  ${c.bold(boss.name)} ${c.dim(boss.title)}: "${boss.taunt}"`);
  const result = await runBattle({ spec: { boss, playerPrompt }, providerConfig: cfg, provider, live: type !== "mock", rpm: type === "mock" ? 0 : 10 });
  for (const r of result.rounds) io.out(`  ${r.testId.padEnd(22)} you ${r.player.pass ? c.green("✓") : c.red("✗")}  boss ${r.champion.pass ? c.green("✓") : c.red("✗")}   HP ${Math.round(r.playerHp)} vs ${Math.round(r.bossHp)}`);
  io.out(`\n  You  ${emojiRow(result)}  ${result.playerHp} HP`);
  io.out(`  Boss ${emojiRow(result, "champion")}  ${result.bossHp} HP`);
  const v = result.verdict;
  io.out("\n  " + (v === "victory" ? c.green(c.bold(`👍 VICTORY - ${boss.defeatLine}`)) : v === "draw" ? c.yellow(c.bold("🤝 DRAW")) : c.red(c.bold(`👎 DEFEAT - ${boss.victoryLine}`))));
  for (const h of battleHints(result)) io.out(c.dim(`  hint: ${h}`));
  return v === "victory" ? 0 : 1;
}

export async function main(argv: string[], io: Io): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "run":
        return await cmdRun(rest, io);
      case "validate":
        return cmdValidate(rest, io);
      case "compare":
        return cmdCompare(rest, io);
      case "init": {
        const file = rest[0] ?? "colosseum.yaml";
        if (existsSync(resolve(io.cwd, file))) throw new UsageError(`${file} already exists`);
        write(io, file, STARTER);
        io.out(`${c.green("✓")} wrote ${file} - try: colosseum run ${file} --mock`);
        return 0;
      }
      case "bosses":
        for (const b of BOSSES) io.out(`  ${String(b.level).padStart(2)}. ${b.emoji} ${c.bold(b.id.padEnd(14))} ${b.name}, ${b.title} ${c.dim(`(Elo ${b.rating})`)}`);
        return 0;
      case "battle":
        return await cmdBattle(rest, io);
      case "--version":
      case "-v":
        io.out(VERSION);
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(HELP);
        return 0;
      default:
        throw new UsageError(`unknown command "${cmd}"`);
    }
  } catch (e) {
    if (e instanceof UsageError || e instanceof SuiteError) {
      io.err(c.red(`error: ${e.message}`));
      return 2;
    }
    if (e instanceof Error && "code" in e && String((e as { code: string }).code).startsWith("ERR_PARSE_ARGS")) {
      io.err(c.red(`error: ${e.message}`));
      return 2;
    }
    throw e;
  }
}
