import { columnKey } from "./runner";
import type { CellResult, RunResult } from "./types";

export type CaseStatus = "pass" | "fail" | "flaky" | "error" | "missing";

export interface CaseAggregate {
  testId: string;
  column: string;
  status: CaseStatus;
  passes: number;
  total: number;
  passRate: number;
  meanScore: number;
  cells: CellResult[];
}

export interface ColumnSummary {
  column: string;
  promptId: string;
  providerId: string;
  cases: number;
  passed: number;
  failed: number;
  flaky: number;
  errors: number;
  passRate: number;
  meanScore: number;
  latencyP50: number;
  latencyP95: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  sources: Record<string, number>;
}

export function aggregateCase(cells: CellResult[], testId: string, column: string): CaseAggregate {
  if (!cells.length) return { testId, column, status: "missing", passes: 0, total: 0, passRate: 0, meanScore: 0, cells };
  const ok = cells.filter((c) => !c.error);
  const passes = ok.filter((c) => c.pass).length;
  const total = cells.length;
  let status: CaseStatus;
  if (!ok.length) status = "error";
  else if (passes === total) status = "pass";
  else if (passes === 0) status = "fail";
  else status = "flaky";
  const meanScore = cells.reduce((a, c) => a + c.score, 0) / total;
  return { testId, column, status, passes, total, passRate: passes / total, meanScore, cells };
}

/** Map column -> testId -> aggregate (handles repeats). */
export function aggregateRun(run: RunResult): Map<string, Map<string, CaseAggregate>> {
  const groups = new Map<string, Map<string, CellResult[]>>();
  for (const c of run.cells) {
    if (!c) continue;
    const col = columnKey(c.promptId, c.providerId);
    if (!groups.has(col)) groups.set(col, new Map());
    const m = groups.get(col)!;
    if (!m.has(c.testId)) m.set(c.testId, []);
    m.get(c.testId)!.push(c);
  }
  const out = new Map<string, Map<string, CaseAggregate>>();
  for (const [col, tests] of groups) {
    const m = new Map<string, CaseAggregate>();
    for (const [testId, cells] of tests) m.set(testId, aggregateCase(cells, testId, col));
    out.set(col, m);
  }
  return out;
}

const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

export function summarizeRun(run: RunResult): ColumnSummary[] {
  const agg = aggregateRun(run);
  const out: ColumnSummary[] = [];
  for (const promptId of run.promptIds)
    for (const providerId of run.providerIds) {
      const column = columnKey(promptId, providerId);
      const cases = [...(agg.get(column)?.values() ?? [])];
      const cells = cases.flatMap((c) => c.cells);
      const lat = cells.filter((c) => !c.error).map((c) => c.latencyMs);
      const sources: Record<string, number> = {};
      cells.forEach((c) => (sources[c.source] = (sources[c.source] ?? 0) + 1));
      const passed = cases.filter((c) => c.status === "pass").length;
      out.push({
        column,
        promptId,
        providerId,
        cases: cases.length,
        passed,
        failed: cases.filter((c) => c.status === "fail").length,
        flaky: cases.filter((c) => c.status === "flaky").length,
        errors: cases.filter((c) => c.status === "error").length,
        passRate: cases.length ? passed / cases.length : 0,
        meanScore: cases.length ? cases.reduce((a, c) => a + c.meanScore, 0) / cases.length : 0,
        latencyP50: pct(lat, 50),
        latencyP95: pct(lat, 95),
        costUsd: cells.reduce((a, c) => a + c.costUsd, 0),
        inputTokens: cells.reduce((a, c) => a + c.usage.inputTokens, 0),
        outputTokens: cells.reduce((a, c) => a + c.usage.outputTokens, 0),
        sources,
      });
    }
  return out;
}

export type ChangeKind = "regression" | "fix" | "became-flaky" | "stabilized" | "still-failing" | "still-passing" | "still-flaky" | "new" | "removed";

export interface CaseChange {
  testId: string;
  kind: ChangeKind;
  before: CaseAggregate | null;
  after: CaseAggregate | null;
}

export interface Comparison {
  baseline: string;
  candidate: string;
  changes: CaseChange[];
  regressions: CaseChange[];
  fixes: CaseChange[];
  flaky: CaseChange[];
  headline: string;
  passRateBefore: number;
  passRateAfter: number;
}

function classify(before: CaseAggregate | null, after: CaseAggregate | null): ChangeKind {
  if (!before || before.status === "missing") return "new";
  if (!after || after.status === "missing") return "removed";
  const b = before.status === "error" ? "fail" : before.status;
  const a = after.status === "error" ? "fail" : after.status;
  if (b === "pass" && a === "fail") return "regression";
  if (b === "pass" && a === "flaky") return "became-flaky";
  if (b === "flaky" && a === "fail") return "regression";
  if (b !== "pass" && a === "pass") return b === "flaky" ? "stabilized" : "fix";
  if (b === "fail" && a === "flaky") return "fix";
  if (a === "flaky") return "still-flaky";
  return a === "pass" ? "still-passing" : "still-failing";
}

const label = (col: string) => col.split("|").join(" · ");

/** Compare two columns (prompt×provider), optionally across two runs. */
export function compareColumns(baseRun: RunResult, baseline: string, candRun: RunResult, candidate: string): Comparison {
  const before = aggregateRun(baseRun).get(baseline) ?? new Map();
  const after = aggregateRun(candRun).get(candidate) ?? new Map();
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const changes = ids.map((testId) => {
    const b = before.get(testId) ?? null;
    const a = after.get(testId) ?? null;
    return { testId, kind: classify(b, a), before: b, after: a };
  });
  const regressions = changes.filter((c) => c.kind === "regression" || c.kind === "became-flaky");
  const fixes = changes.filter((c) => c.kind === "fix" || c.kind === "stabilized");
  const flaky = changes.filter((c) => c.after?.status === "flaky");
  const rate = (m: Map<string, CaseAggregate>) => (m.size ? [...m.values()].filter((x) => x.status === "pass").length / m.size : 0);
  const bl = label(baseline);
  const cl = label(candidate);
  const parts: string[] = [];
  const hard = regressions.filter((r) => r.kind === "regression").length;
  const soft = regressions.length - hard;
  if (hard) parts.push(`${hard} case${hard === 1 ? "" : "s"} that passed in ${bl} now fail${hard === 1 ? "s" : ""} in ${cl}`);
  if (soft) parts.push(`${soft} became flaky`);
  if (fixes.length) parts.push(`${fixes.length} fixed`);
  const headline = parts.length ? parts.join(" · ") : `No regressions: ${cl} matches or beats ${bl}`;
  return { baseline, candidate, changes, regressions, fixes, flaky, headline, passRateBefore: rate(before), passRateAfter: rate(after) };
}

export interface FlakyCase {
  column: string;
  testId: string;
  passes: number;
  total: number;
}

export function findFlaky(run: RunResult): FlakyCase[] {
  const out: FlakyCase[] = [];
  for (const [column, tests] of aggregateRun(run)) for (const a of tests.values()) if (a.status === "flaky") out.push({ column, testId: a.testId, passes: a.passes, total: a.total });
  return out;
}
