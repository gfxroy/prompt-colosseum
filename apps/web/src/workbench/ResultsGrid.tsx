import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { aggregateRun, findFlaky, summarizeRun, type CaseAggregate, type RunResult, type Suite } from "@colosseum/core";
import { colLabel, ms, pct, usd, num } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import CellDrawer from "./CellDrawer";

const STATUS: Record<string, string> = {
  pass: "bg-emerald-500/80 text-emerald-950",
  fail: "bg-rose-500/80 text-rose-950",
  flaky: "bg-amber-400/80 text-amber-950",
  error: "bg-fuchsia-500/70 text-fuchsia-950",
  missing: "bg-white/5 text-gray-600",
};

function Rate({ value }: { value: number }) {
  const v = useCountUp(Math.round(value * 100), 900);
  return <span>{v}%</span>;
}

export default function ResultsGrid({ run, suite }: { run: RunResult; suite: Suite }) {
  const summaries = useMemo(() => summarizeRun(run), [run]);
  const agg = useMemo(() => aggregateRun(run), [run]);
  const flaky = useMemo(() => findFlaky(run), [run]);
  const [open, setOpen] = useState<CaseAggregate | null>(null);
  const label = (col: string) => {
    const [p, pr] = col.split("|");
    return { p: suite.prompts.find((x) => x.id === p)?.label ?? p, pr: suite.providers.find((x) => x.id === pr)?.label ?? pr };
  };
  return (
    <div className="space-y-5" data-testid="results">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((s) => {
          const l = label(s.column);
          const src = Object.keys(s.sources);
          return (
            <div key={s.column} className="card p-4">
              <div className="truncate text-xs font-bold text-gray-400" title={l.p}>
                {l.p}
              </div>
              <div className="truncate text-[11px] text-gray-500">{l.pr}</div>
              <div className={clsx("mt-2 text-3xl font-black", s.passRate === 1 ? "text-emerald-400" : s.passRate >= 0.5 ? "text-amber-300" : "text-rose-400")}>
                <Rate value={s.passRate} />
              </div>
              <div className="text-[11px] text-gray-500">
                {s.passed}/{s.cases} pass · {s.flaky} flaky · {s.failed + s.errors} fail
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-gray-400">
                <span title="p50 / p95 latency">⏱ {ms(s.latencyP50)}</span>
                <span title="tokens in+out">🔤 {num(s.inputTokens + s.outputTokens)}</span>
                <span title="estimated cost">💲{usd(s.costUsd).slice(1)}</span>
              </div>
              <div className="mt-2 flex gap-1">
                {src.map((x) => (
                  <span key={x} className={clsx("chip text-[10px]", x === "live" ? "text-emerald-300" : x === "recorded" ? "text-sky-300" : x === "mock" ? "text-violet-300" : "text-rose-300")}>
                    {x}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="label !mb-0">Pass/fail heatmap · click a cell to inspect</div>
          <div className="flex gap-2 text-[11px] text-gray-400">
            {["pass", "flaky", "fail", "error"].map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={clsx("h-3 w-3 rounded", STATUS[s])} />
                {s}
              </span>
            ))}
          </div>
        </div>
        <table className="w-full border-separate border-spacing-1 text-xs" data-testid="heatmap">
          <thead>
            <tr>
              <th className="text-left font-normal text-gray-500">case</th>
              {summaries.map((s) => (
                <th key={s.column} className="min-w-[110px] font-mono font-normal text-gray-400">
                  {colLabel(s.column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.testIds.map((t) => (
              <tr key={t}>
                <td className="pr-3 font-mono whitespace-nowrap text-gray-300">{t}</td>
                {summaries.map((s) => {
                  const a = agg.get(s.column)?.get(t);
                  const status = a?.status ?? "missing";
                  return (
                    <td key={s.column}>
                      <button
                        onClick={() => a && setOpen(a)}
                        className={clsx("h-9 w-full rounded-lg font-mono text-[11px] font-bold transition hover:scale-[1.04] hover:ring-2 hover:ring-white/30", STATUS[status])}
                        title={`${t} · ${colLabel(s.column)}: ${status}`}
                        data-status={status}
                      >
                        {a ? (a.total > 1 ? `${a.passes}/${a.total}` : status === "pass" ? "✓" : status === "error" ? "!" : `${Math.round(a.meanScore * 100)}%`) : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {flaky.length > 0 && (
        <div className="card border-amber-400/20 p-4">
          <div className="label text-amber-300">⚠ Flaky cases ({flaky.length})</div>
          <div className="flex flex-wrap gap-2">
            {flaky.map((f) => (
              <button key={f.column + f.testId} className="chip cursor-pointer border-amber-400/30 text-amber-200" onClick={() => setOpen(agg.get(f.column)!.get(f.testId)!)}>
                {f.testId} · {colLabel(f.column)} · {f.passes}/{f.total}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Same input, different verdicts across repeats - sampling variance your CI would otherwise discover at random.</p>
        </div>
      )}
      <CellDrawer agg={open} onClose={() => setOpen(null)} />
      <p className="text-[11px] text-gray-500">{pct(summaries.reduce((a, s) => a + s.passRate, 0) / Math.max(1, summaries.length))} mean pass rate · run {run.id} · {new Date(run.startedAt).toLocaleString()}</p>
    </div>
  );
}
