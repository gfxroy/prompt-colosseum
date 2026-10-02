import { useState } from "react";
import { clsx } from "clsx";
import { Play, Square, Sparkles } from "lucide-react";
import { estimateRun, runSuite, cellKey, type CellResult, type Embedder, type RunResult, type Suite } from "@colosseum/core";
import { keyStore } from "../lib/state";
import { providerMode, suiteProviders } from "../lib/providers";
import { loadEmbedder } from "../lib/embeddings";
import { num, usd } from "../lib/format";

const MODE_STYLE = { live: "border-emerald-400/40 text-emerald-300", recorded: "border-sky-400/40 text-sky-300", mock: "border-violet-400/40 text-violet-300" };
const MODE_LABEL = { live: "LIVE · your key", recorded: "RECORDED · real responses", mock: "MOCK · simulator" };

export default function RunPanel({ suite, onDone }: { suite: Suite; onDone: (r: RunResult) => void }) {
  const k = keyStore.use();
  const [promptIds, setPromptIds] = useState(suite.prompts.map((p) => p.id));
  const [providerIds, setProviderIds] = useState(suite.providers.map((p) => p.id));
  const [repeats, setRepeats] = useState(suite.settings?.repeats ?? 1);
  const [concurrency, setConcurrency] = useState(suite.settings?.concurrency ?? 4);
  const [rpm, setRpm] = useState(12);
  const [semantic, setSemantic] = useState(false);
  const [embedMsg, setEmbedMsg] = useState("");
  const [running, setRunning] = useState<AbortController | null>(null);
  const [cells, setCells] = useState<Record<string, CellResult | "running">>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const toggle = (list: string[], set: (x: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const est = estimateRun({ suite, promptIds, providerIds, repeats });
  const anyLive = suite.providers.some((p) => providerIds.includes(p.id) && providerMode(p, k) === "live");
  const hasSimilar = suite.tests.some((t) => t.assert.some((a) => a.type === "similar"));

  const start = async () => {
    const ctrl = new AbortController();
    setRunning(ctrl);
    setCells({});
    setLog([]);
    setError("");
    let embedder: Embedder | undefined;
    try {
      if (semantic) embedder = await loadEmbedder(setEmbedMsg);
    } catch (e) {
      setEmbedMsg(`Embeddings unavailable (${(e as Error).message}); using lexical similarity`);
    }
    try {
      const run = await runSuite({
        suite,
        providers: suiteProviders(suite, k, anyLive ? 0 : 0.35),
        promptIds,
        providerIds,
        repeats,
        concurrency,
        rpm: anyLive ? rpm : 0,
        embedder,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (e.type === "start") setProgress({ done: 0, total: e.total });
          if (e.type === "cell-start") setCells((c) => ({ ...c, [e.key]: "running" }));
          if (e.type === "cell-done") {
            setCells((c) => ({ ...c, [e.cell.key]: e.cell }));
            setProgress({ done: e.done, total: e.total });
          }
          if (e.type === "retry") setLog((l) => [`↻ ${e.key.replace(/\|/g, " · ")} - retry ${e.attempt} in ${Math.round(e.waitMs / 1000)}s: ${e.reason.slice(0, 90)}`, ...l].slice(0, 8));
        },
      });
      onDone(run);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const tests = suite.tests;
  const cols = suite.prompts.filter((p) => promptIds.includes(p.id)).flatMap((p) => suite.providers.filter((pr) => providerIds.includes(pr.id)).map((pr) => ({ p, pr })));
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <div className="label">Prompt versions</div>
          <div className="flex flex-wrap gap-2">
            {suite.prompts.map((p) => (
              <label key={p.id} className={clsx("chip cursor-pointer px-3 py-1 text-sm", promptIds.includes(p.id) && "border-gold-400/60 text-gold-300")}>
                <input type="checkbox" className="hidden" checked={promptIds.includes(p.id)} onChange={() => toggle(promptIds, setPromptIds, p.id)} />
                {p.label ?? p.id}
              </label>
            ))}
          </div>
          <div className="label mt-4">Models</div>
          <div className="space-y-2">
            {suite.providers.map((p) => {
              const m = providerMode(p, k);
              return (
                <label key={p.id} className={clsx("flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2", providerIds.includes(p.id) ? "border-gold-400/40 bg-gold-400/5" : "border-white/10")}>
                  <span className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={providerIds.includes(p.id)} onChange={() => toggle(providerIds, setProviderIds, p.id)} />
                    <span className="font-semibold text-gray-200">{p.label ?? p.id}</span>
                    <span className="font-mono text-xs text-gray-500">{p.model}</span>
                  </span>
                  <span className={clsx("chip text-[10px]", MODE_STYLE[m])}>{MODE_LABEL[m]}</span>
                </label>
              );
            })}
          </div>
          {!anyLive && <p className="mt-2 text-xs text-gray-500">No key: real models replay responses recorded from the API (a prompt you edited falls back to mock-1 and is labelled). Add a key via the mode badge for live runs.</p>}
        </div>
        <div className="card p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">repeats</label>
              <input type="number" min={1} max={10} className="input" value={repeats} onChange={(e) => setRepeats(Math.max(1, Math.min(10, Number(e.target.value))))} />
            </div>
            <div>
              <label className="label">concurrency</label>
              <input type="number" min={1} max={16} className="input" value={concurrency} onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value)))} />
            </div>
            <div>
              <label className="label">req / min</label>
              <input type="number" min={1} className="input" value={rpm} onChange={(e) => setRpm(Math.max(1, Number(e.target.value)))} disabled={!anyLive} />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">Repeats &gt; 1 reveal flaky cases. Rate limiting + exponential backoff (honouring Retry-After) apply to live calls.</p>
          {hasSimilar && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <input type="checkbox" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} className="mt-1" />
              <span>
                <span className="flex items-center gap-1 font-semibold text-gray-200">
                  <Sparkles size={14} className="text-gold-400" /> In-browser embeddings for <code>similar</code>
                </span>
                <span className="text-xs text-gray-500">MiniLM-L6 via transformers.js (~23 MB, downloaded once). Off = fast lexical similarity.</span>
                {embedMsg && <span className="block text-xs text-sky-300">{embedMsg}</span>}
              </span>
            </label>
          )}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              ["calls", num(est.calls)],
              ["judge", num(est.judgeCalls)],
              ["~tokens", num(est.inputTokens + est.outputTokens)],
              ["est. cost", anyLive ? usd(est.usd) : "$0"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-white/5 py-2">
                <div className="font-mono text-sm font-bold text-white">{b}</div>
                <div className="text-[10px] text-gray-500 uppercase">{a}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {running ? (
              <button className="btn-danger" onClick={() => running.abort()}>
                <Square size={14} /> Cancel
              </button>
            ) : (
              <button className="btn-gold px-6" onClick={start} disabled={!promptIds.length || !providerIds.length} data-testid="run-suite">
                <Play size={15} /> Run {est.calls} cells
              </button>
            )}
          </div>
        </div>
      </div>

      {(running || progress.total > 0) && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-200">{running ? "Running…" : "Finished"}</span>
            <span className="font-mono text-gray-400">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-950">
            <div className="h-full bg-gradient-to-r from-gold-400 to-ember-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th />
                  {cols.map(({ p, pr }) => (
                    <th key={p.id + pr.id} className="px-1 pb-1 font-mono font-normal text-gray-500">
                      {p.id}·{pr.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td className="pr-2 font-mono text-gray-500">{t.id}</td>
                    {cols.map(({ p, pr }) => (
                      <td key={p.id + pr.id} className="px-1 py-0.5">
                        <div className="flex gap-0.5">
                          {Array.from({ length: repeats }, (_, r) => {
                            const c = cells[cellKey(p.id, pr.id, t.id, r)];
                            return (
                              <div
                                key={r}
                                className={clsx(
                                  "h-4 w-4 rounded transition-colors",
                                  !c ? "bg-white/5" : c === "running" ? "animate-pulse bg-gold-400/50" : c.error ? "bg-fuchsia-500/70" : c.pass ? "bg-emerald-500/80" : "bg-rose-500/80",
                                )}
                              />
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.length > 0 && (
            <div className="mt-3 space-y-0.5 font-mono text-[11px] text-amber-300/80">
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="card border-rose-500/30 p-4 text-sm text-rose-300">{error}</div>}
    </div>
  );
}
