import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { clsx } from "clsx";
import { Download, FileUp, Link2, Plus, Trash2, FlaskConical, History, Check } from "lucide-react";
import { decodeShare, encodeShare, normalizeSuite, parseSuite, suiteToJson, suiteToYaml, toJUnit, toMarkdown, compareColumns, SuiteError, validateSuite, type RunResult, type Suite } from "@colosseum/core";
import YAML from "yaml";
import { EXAMPLES } from "../demo/examples";
import { runsStore, saveRun, suitesStore } from "../lib/state";
import { copyText, downloadText } from "../lib/download";
import SuiteEditor from "./SuiteEditor";
import RunPanel from "./RunPanel";
import ResultsGrid from "./ResultsGrid";
import ComparePanel from "./ComparePanel";

type Tab = "editor" | "run" | "results" | "compare" | "history";

function loadYaml(id: string): string {
  return EXAMPLES.find((e) => e.id === id)?.yaml ?? suitesStore.get().suites.find((s) => s.id === id)?.yaml ?? EXAMPLES[0].yaml;
}

export default function Workbench() {
  const [params, setParams] = useSearchParams();
  const [suiteId, setSuiteId] = useState<string | null>(params.get("suite"));
  const [yaml, setYaml] = useState<string>(() => (params.get("suite") ? loadYaml(params.get("suite")!) : ""));
  const [tab, setTab] = useState<Tab>("editor");
  const [run, setRun] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState("");
  const saved = suitesStore.use();
  const history = runsStore.use();
  const fileRef = useRef<HTMLInputElement>(null);

  const suite: Suite | null = useMemo(() => {
    if (!yaml) return null;
    try {
      return parseSuite(yaml);
    } catch {
      return null;
    }
  }, [yaml]);

  // Load a shared suite from #/workbench?s=<token>
  useEffect(() => {
    const token = params.get("s");
    if (!token) return;
    decodeShare<Suite>(token)
      .then((raw) => {
        const s = normalizeSuite(raw);
        const errors = validateSuite(s).filter((i) => i.severity === "error");
        if (errors.length) throw new SuiteError(errors);
        const id = `shared-${Date.now().toString(36)}`;
        const y = suiteToYaml(s);
        suitesStore.set((st) => ({ suites: [{ id, yaml: y, updatedAt: new Date().toISOString() }, ...st.suites] }));
        setSuiteId(id);
        setYaml(y);
        setNotice(`Loaded shared suite “${s.name}”`);
        setParams({ suite: id }, { replace: true });
      })
      .catch((e) => setNotice(`Could not load shared link: ${(e as Error).message}`));
  }, [params, setParams]);

  const open = (id: string) => {
    setSuiteId(id);
    setYaml(loadYaml(id));
    setRun(null);
    setTab("editor");
    setParams({ suite: id }, { replace: true });
  };

  const persist = (y: string) => {
    setYaml(y);
    if (!suiteId) return;
    if (EXAMPLES.some((e) => e.id === suiteId)) return; // examples stay pristine unless saved as a copy
    suitesStore.set((st) => ({ suites: st.suites.map((s) => (s.id === suiteId ? { ...s, yaml: y, updatedAt: new Date().toISOString() } : s)) }));
  };
  const onSuite = (s: Suite) => persist(suiteToYaml(s));

  const saveCopy = () => {
    if (!suite) return;
    const id = `suite-${Date.now().toString(36)}`;
    suitesStore.set((st) => ({ suites: [{ id, yaml, updatedAt: new Date().toISOString() }, ...st.suites] }));
    setSuiteId(id);
    setParams({ suite: id }, { replace: true });
    setNotice("Saved to your suites (localStorage)");
  };

  const importFile = async (f: File) => {
    const text = await f.text();
    try {
      const raw = f.name.endsWith(".json") || text.trim().startsWith("{") ? JSON.parse(text) : YAML.parse(text);
      const s = normalizeSuite(raw);
      const errs = validateSuite(s).filter((i) => i.severity === "error");
      if (errs.length) throw new SuiteError(errs);
      const id = `suite-${Date.now().toString(36)}`;
      const y = suiteToYaml(s);
      suitesStore.set((st) => ({ suites: [{ id, yaml: y, updatedAt: new Date().toISOString() }, ...st.suites] }));
      open(id);
      setNotice(`Imported “${s.name}”`);
    } catch (e) {
      setNotice(`Import failed: ${(e as Error).message}`);
    }
  };

  const share = async () => {
    if (!suite) return;
    const token = await encodeShare(suite);
    const url = `${location.origin}${location.pathname}#/workbench?s=${token}`;
    await copyText(url);
    setNotice(url.length > 8000 ? "Link copied (it's long - consider exporting YAML instead)" : "Share link copied to clipboard");
  };

  const onDone = (r: RunResult) => {
    setRun(r);
    saveRun({ run: r, suiteId: suiteId ?? "", label: r.suiteName });
    setTab("results");
  };

  const custom = saved.suites.map((s) => {
    try {
      return { id: s.id, name: (YAML.parse(s.yaml) as { name?: string })?.name ?? s.id };
    } catch {
      return { id: s.id, name: s.id };
    }
  });

  const newSuite = () => {
    const id = `suite-${Date.now().toString(36)}`;
    const y = `name: My suite\nprompts:\n  - id: v1\n    template: |\n      Summarize in one sentence: {{text}}\nproviders:\n  - id: mock\n    type: mock\n    model: mock-1\ntests:\n  - id: example\n    vars:\n      text: The quick brown fox jumps over the lazy dog. It was a sunny day.\n    assert:\n      - type: length\n        max: 25\n        unit: words\n`;
    suitesStore.set((st) => ({ suites: [{ id, yaml: y, updatedAt: new Date().toISOString() }, ...st.suites] }));
    open(id);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <FlaskConical className="text-sky-300" /> Workbench
          </h1>
          <p className="text-xs text-gray-500">Pro mode - the same engine as the CLI.</p>
        </div>
        <div className="card p-3">
          <div className="label px-1">Example suites</div>
          {EXAMPLES.map((e) => (
            <button key={e.id} onClick={() => open(e.id)} className={clsx("w-full rounded-xl px-2 py-2 text-left transition", suiteId === e.id ? "bg-white/10" : "hover:bg-white/5")} data-testid={`example-${e.id}`}>
              <div className="text-sm font-semibold text-gray-200">
                {e.emoji} {e.title}
              </div>
              <div className="text-[11px] text-gray-500">{e.blurb}</div>
            </button>
          ))}
        </div>
        <div className="card p-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="label !mb-0">Your suites</span>
            <button className="text-gray-400 hover:text-white" onClick={newSuite} aria-label="New suite" title="New suite">
              <Plus size={16} />
            </button>
          </div>
          {custom.length === 0 && <p className="px-1 text-xs text-gray-500">Saved suites live in your browser.</p>}
          {custom.map((s) => (
            <div key={s.id} className={clsx("group flex items-center rounded-xl", suiteId === s.id ? "bg-white/10" : "hover:bg-white/5")}>
              <button onClick={() => open(s.id)} className="flex-1 truncate px-2 py-1.5 text-left text-sm text-gray-300">
                {s.name}
              </button>
              <button className="px-2 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-rose-300" onClick={() => suitesStore.set((st) => ({ suites: st.suites.filter((x) => x.id !== s.id) }))} aria-label="Delete suite">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <input ref={fileRef} type="file" accept=".yaml,.yml,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <button className="btn-ghost mt-2 w-full text-xs" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} /> Import YAML / JSON
          </button>
        </div>
      </aside>

      <section className="min-w-0">
        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-2 text-sm text-sky-200">
            <span className="truncate">{notice}</span>
            <button className="text-xs text-gray-400" onClick={() => setNotice("")}>
              dismiss
            </button>
          </div>
        )}
        {!suite ? (
          yaml ? (
            <div className="card p-6 text-rose-300">This suite has errors. Open the YAML to fix it.</div>
          ) : (
            <EmptyState onPick={open} />
          )
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-white" data-testid="suite-title">
                  {suite.name}
                </h2>
                {suite.description && <p className="max-w-3xl text-sm text-gray-400">{suite.description}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="chip">{suite.prompts.length} prompt versions</span>
                  <span className="chip">{suite.providers.length} models</span>
                  <span className="chip">{suite.tests.length} cases</span>
                  <span className="chip">{suite.tests.reduce((a, t) => a + t.assert.length, 0) + (suite.defaults?.assert?.length ?? 0) * suite.tests.length} assertions</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.some((e) => e.id === suiteId) && (
                  <button className="btn-ghost text-xs" onClick={saveCopy}>
                    <Check size={14} /> Save as my suite
                  </button>
                )}
                <button className="btn-ghost text-xs" onClick={share} data-testid="share-link">
                  <Link2 size={14} /> Share link
                </button>
                <button className="btn-ghost text-xs" onClick={() => downloadText(`${suite.name.replace(/\W+/g, "-").toLowerCase()}.yaml`, suiteToYaml(suite), "text/yaml")}>
                  <Download size={14} /> YAML
                </button>
                <button className="btn-ghost text-xs" onClick={() => downloadText(`${suite.name.replace(/\W+/g, "-").toLowerCase()}.json`, suiteToJson(suite), "application/json")}>
                  <Download size={14} /> JSON
                </button>
              </div>
            </div>

            <div className="flex gap-1 border-b border-white/5">
              {(["editor", "run", "results", "compare", "history"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  disabled={(t === "results" || t === "compare") && !run}
                  className={clsx("-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize transition disabled:opacity-30", tab === t ? "border-gold-400 text-white" : "border-transparent text-gray-400 hover:text-gray-200")}
                  data-testid={`tab-${t}`}
                >
                  {t === "compare" ? "Compare & regressions" : t}
                </button>
              ))}
            </div>

            {tab === "editor" && <SuiteEditor suite={suite} yaml={yaml} onSuite={onSuite} onYaml={persist} />}
            {tab === "run" && <RunPanel key={yaml} suite={suite} onDone={onDone} />}
            {tab === "results" && run && (
              <>
                <ResultsGrid run={run} suite={suite} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" onClick={() => downloadText(`${run.id}.json`, JSON.stringify(run, null, 2), "application/json")}>
                    <Download size={14} /> results.json (CLI baseline)
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => downloadText(`${run.id}.junit.xml`, toJUnit(run), "application/xml")}>
                    <Download size={14} /> JUnit XML
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => {
                      const cols = [...new Set(run.cells.map((c) => `${c.promptId}|${c.providerId}`))];
                      const cmp = cols.length > 1 ? compareColumns(run, cols[0], run, cols.find((c) => c.split("|")[1] === cols[0].split("|")[1] && c !== cols[0]) ?? cols[1]) : null;
                      downloadText(`${run.id}.md`, toMarkdown(run, cmp), "text/markdown");
                    }}
                  >
                    <Download size={14} /> Markdown summary
                  </button>
                </div>
              </>
            )}
            {tab === "compare" && run && <ComparePanel run={run} history={history.runs} />}
            {tab === "history" && (
              <div className="card divide-y divide-white/5">
                {history.runs.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-500">
                    <History className="mx-auto mb-2" /> No runs yet. Runs are kept in your browser (last 12).
                  </div>
                )}
                {history.runs.map((h) => {
                  const passes = h.run.cells.filter((c) => c.pass).length;
                  return (
                    <div key={h.run.id} className="flex items-center gap-3 p-3 text-sm">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-200">{h.label}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(h.run.startedAt).toLocaleString()} · {h.run.promptIds.join(", ")} × {h.run.providerIds.join(", ")} · ×{h.run.repeats}
                        </div>
                      </div>
                      <span className="chip">
                        {passes}/{h.run.cells.length} cells pass
                      </span>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          setRun(h.run);
                          setTab("results");
                        }}
                      >
                        Open
                      </button>
                      <button className="text-gray-600 hover:text-rose-300" onClick={() => runsStore.set((s) => ({ runs: s.runs.filter((x) => x.run.id !== h.run.id) }))} aria-label="Delete run">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="card p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-5xl">🧪</div>
        <h2 className="mt-3 text-2xl font-black text-white">Unit tests for your prompts</h2>
        <p className="mt-2 text-gray-400">
          A suite = prompt versions × models × test cases with assertions. Run the matrix, see a pass/fail heatmap, catch regressions between v1 and v2, and spot flaky cases with repeats. Start from an
          example:
        </p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {EXAMPLES.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} className="card p-4 text-left transition hover:border-gold-400/40" data-testid={`empty-${e.id}`}>
            <div className="text-2xl">{e.emoji}</div>
            <div className="mt-1 font-bold text-white">{e.title}</div>
            <div className="text-xs text-gray-400">{e.blurb}</div>
          </button>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-gray-500">
        Prefer the terminal? <code className="text-gray-300">npx prompt-colosseum run suite.yaml</code> - same engine, JUnit + Markdown output, fails CI on regressions.
      </p>
    </div>
  );
}
