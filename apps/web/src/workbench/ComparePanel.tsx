import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { compareColumns, summarizeRun, type CaseChange, type RunResult } from "@colosseum/core";
import DiffView from "../components/DiffView";
import { colLabel, pct } from "../lib/format";
import type { SavedRun } from "../lib/state";

const KIND_STYLE: Record<string, string> = {
  regression: "text-rose-300 border-rose-400/40",
  "became-flaky": "text-amber-300 border-amber-400/40",
  fix: "text-emerald-300 border-emerald-400/40",
  stabilized: "text-emerald-300 border-emerald-400/40",
  "still-failing": "text-gray-400",
  "still-passing": "text-gray-500",
  "still-flaky": "text-amber-200",
  new: "text-sky-300",
  removed: "text-gray-500",
};

export default function ComparePanel({ run, history }: { run: RunResult; history: SavedRun[] }) {
  const runs = useMemo(() => [run, ...history.map((h) => h.run).filter((r) => r.id !== run.id)], [run, history]);
  const cols = (r: RunResult) => summarizeRun(r).map((s) => s.column);
  const [baseRunId, setBaseRunId] = useState(run.id);
  const [candRunId, setCandRunId] = useState(run.id);
  const baseRun = runs.find((r) => r.id === baseRunId) ?? run;
  const candRun = runs.find((r) => r.id === candRunId) ?? run;
  const defaultBase = cols(baseRun)[0];
  const defaultCand = cols(candRun).find((c) => c.split("|")[1] === defaultBase?.split("|")[1] && c !== defaultBase) ?? cols(candRun)[1] ?? cols(candRun)[0];
  const [baseCol, setBaseCol] = useState(defaultBase);
  const [candCol, setCandCol] = useState(defaultCand);
  const bc = cols(baseRun).includes(baseCol) ? baseCol : defaultBase;
  const cc = cols(candRun).includes(candCol) ? candCol : defaultCand;
  const cmp = useMemo(() => compareColumns(baseRun, bc, candRun, cc), [baseRun, bc, candRun, cc]);
  const [open, setOpen] = useState<string | null>(null);
  const runLabel = (r: RunResult) => (r.id === run.id ? "current run" : `${r.suiteName} · ${new Date(r.startedAt).toLocaleTimeString()}`);
  const interesting = cmp.changes.filter((c) => !["still-passing"].includes(c.kind));
  const rest = cmp.changes.filter((c) => c.kind === "still-passing");

  const Picker = ({ label, runId, setRun, col, setCol, r }: { label: string; runId: string; setRun: (s: string) => void; col: string; setCol: (s: string) => void; r: RunResult }) => (
    <div className="card p-4">
      <div className="label">{label}</div>
      <select className="input mb-2" value={runId} onChange={(e) => setRun(e.target.value)}>
        {runs.map((x) => (
          <option key={x.id} value={x.id}>
            {runLabel(x)}
          </option>
        ))}
      </select>
      <select className="input" value={col} onChange={(e) => setCol(e.target.value)} data-testid={`${label.toLowerCase()}-col`}>
        {cols(r).map((c) => (
          <option key={c} value={c}>
            {colLabel(c)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="compare">
      <div className="grid gap-4 md:grid-cols-2">
        {Picker({ label: "Baseline", runId: baseRunId, setRun: setBaseRunId, col: bc, setCol: setBaseCol, r: baseRun })}
        {Picker({ label: "Candidate", runId: candRunId, setRun: setCandRunId, col: cc, setCol: setCandCol, r: candRun })}
      </div>
      <div className={clsx("card p-5", cmp.regressions.length ? "border-rose-500/40 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5")} data-testid="regression-banner">
        <div className={clsx("text-xl font-black", cmp.regressions.length ? "text-rose-300" : "text-emerald-300")}>{cmp.regressions.length ? "▼ Regression detected" : "▲ No regressions"}</div>
        <div className="mt-1 text-gray-200">{cmp.headline}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
          <span>
            pass rate {pct(cmp.passRateBefore)} → <b className={cmp.passRateAfter < cmp.passRateBefore ? "text-rose-300" : "text-emerald-300"}>{pct(cmp.passRateAfter)}</b>
          </span>
          <span>{cmp.regressions.length} regressions</span>
          <span>{cmp.fixes.length} fixes</span>
          <span>{cmp.flaky.length} flaky</span>
        </div>
      </div>
      <div className="card divide-y divide-white/5">
        {[...interesting, ...rest].map((c: CaseChange) => {
          const before = c.before?.cells[0];
          const after = c.after?.cells.find((x) => !x.pass) ?? c.after?.cells[0];
          return (
            <div key={c.testId} className="p-3">
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === c.testId ? null : c.testId)}>
                <span className="font-mono text-sm text-gray-200">{c.testId}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">
                    {c.before?.status ?? "-"} → {c.after?.status ?? "-"}
                  </span>
                  <span className={clsx("chip", KIND_STYLE[c.kind])}>{c.kind}</span>
                </span>
              </button>
              {open === c.testId && (
                <div className="mt-3 space-y-2">
                  {after && (
                    <div className="space-y-1">
                      {after.assertions
                        .filter((a) => !a.pass)
                        .map((a, i) => (
                          <div key={i} className="text-xs text-rose-300">
                            ✗ {a.type}: <span className="text-gray-400">{a.reason}</span>
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-500">output diff (baseline → candidate)</div>
                  <DiffView a={before?.output ?? ""} b={after?.output ?? ""} className="max-h-72" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
