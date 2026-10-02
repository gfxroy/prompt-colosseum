import { aggregateRun, summarizeRun, type Comparison } from "../analysis";
import type { RunResult } from "../types";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const icon: Record<string, string> = { pass: "✅", fail: "❌", flaky: "⚠️", error: "💥", missing: "·" };

/** Markdown summary for $GITHUB_STEP_SUMMARY / PR comments. */
export function toMarkdown(run: RunResult, comparison?: Comparison | null): string {
  const s = summarizeRun(run);
  const agg = aggregateRun(run);
  const out: string[] = [`## 🏛️ Prompt Colosseum - ${run.suiteName}`, ""];
  if (comparison) {
    const bad = comparison.regressions.length > 0;
    out.push(`> ${bad ? "🔴 **Regression detected:**" : "🟢"} ${comparison.headline}`, "");
  }
  out.push("| Prompt | Provider | Pass rate | ✅ | ❌ | ⚠️ flaky | p50 latency | Cost |", "|---|---|---|---|---|---|---|---|");
  for (const c of s) out.push(`| \`${c.promptId}\` | \`${c.providerId}\` | **${pct(c.passRate)}** | ${c.passed} | ${c.failed + c.errors} | ${c.flaky} | ${Math.round(c.latencyP50)} ms | $${c.costUsd.toFixed(5)} |`);
  out.push("", "<details><summary>Per-case results</summary>", "", `| Case | ${s.map((c) => `${c.promptId} · ${c.providerId}`).join(" | ")} |`, `|---|${s.map(() => "---").join("|")}|`);
  for (const t of run.testIds) out.push(`| ${t} | ${s.map((c) => icon[agg.get(c.column)?.get(t)?.status ?? "missing"]).join(" | ")} |`);
  out.push("", "</details>", "");
  if (comparison?.regressions.length) {
    out.push("### Regressions", "");
    for (const r of comparison.regressions) {
      const failed = r.after?.cells.find((c) => !c.pass);
      const why = failed?.assertions.filter((a) => !a.pass).map((a) => `\`${a.type}\` ${a.reason}`).join("; ") ?? failed?.error ?? "";
      out.push(`- **${r.testId}** (${r.kind}): ${why}`);
    }
    out.push("");
  }
  const failures = s.flatMap((c) => [...(agg.get(c.column)?.values() ?? [])].filter((a) => a.status !== "pass"));
  if (failures.length && !comparison) {
    out.push("### Failures", "");
    for (const f of failures.slice(0, 25)) {
      const cell = f.cells.find((c) => !c.pass) ?? f.cells[0];
      out.push(`- **${f.testId}** @ \`${f.column.replace("|", " · ")}\`: ${cell.error ?? cell.assertions.filter((a) => !a.pass).map((a) => `\`${a.type}\` ${a.reason}`).join("; ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
