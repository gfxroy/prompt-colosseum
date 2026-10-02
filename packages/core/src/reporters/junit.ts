import { aggregateRun, summarizeRun } from "../analysis";
import type { RunResult } from "../types";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** JUnit XML: one <testsuite> per prompt×provider column, one <testcase> per test (repeats aggregated). */
export function toJUnit(run: RunResult): string {
  const agg = aggregateRun(run);
  const summaries = summarizeRun(run);
  const totalTests = summaries.reduce((a, s) => a + s.cases, 0);
  const totalFail = summaries.reduce((a, s) => a + s.failed + s.flaky, 0);
  const totalErr = summaries.reduce((a, s) => a + s.errors, 0);
  const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, `<testsuites name="${esc(run.suiteName)}" tests="${totalTests}" failures="${totalFail}" errors="${totalErr}">`];
  for (const s of summaries) {
    const cases = [...(agg.get(s.column)?.values() ?? [])];
    const time = cases.flatMap((c) => c.cells).reduce((a, c) => a + c.latencyMs, 0) / 1000;
    lines.push(`  <testsuite name="${esc(`${s.promptId} @ ${s.providerId}`)}" tests="${s.cases}" failures="${s.failed + s.flaky}" errors="${s.errors}" time="${time.toFixed(3)}">`);
    for (const c of cases) {
      const t = c.cells.reduce((a, x) => a + x.latencyMs, 0) / 1000 / Math.max(1, c.cells.length);
      lines.push(`    <testcase classname="${esc(`${run.suiteName}.${s.promptId}.${s.providerId}`)}" name="${esc(c.testId)}" time="${t.toFixed(3)}">`);
      if (c.status === "error") {
        lines.push(`      <error message="${esc(c.cells.find((x) => x.error)?.error ?? "error")}"/>`);
      } else if (c.status !== "pass") {
        const failed = c.cells.find((x) => !x.pass) ?? c.cells[0];
        const reasons = failed.assertions.filter((a) => !a.pass).map((a) => `${a.type}: ${a.reason}`);
        const msg = c.status === "flaky" ? `flaky: passed ${c.passes}/${c.total} repeats` : reasons[0] ?? "failed";
        lines.push(`      <failure message="${esc(msg)}" type="${c.status}">${esc(reasons.join("\n") + "\n\nOutput:\n" + failed.output.slice(0, 2000))}</failure>`);
      }
      lines.push(`    </testcase>`);
    }
    lines.push(`  </testsuite>`);
  }
  lines.push(`</testsuites>`);
  return lines.join("\n") + "\n";
}
