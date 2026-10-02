import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Plus, Trash2, GitCompare } from "lucide-react";
import { ASSERTION_DOCS, extractVariables, normalizeSuite, stringify, validateSuite, type Suite, type TestCase } from "@colosseum/core";
import YAML from "yaml";
import DiffView from "../components/DiffView";
import Modal from "../components/Modal";

export default function SuiteEditor({ suite, yaml, onSuite, onYaml }: { suite: Suite; yaml: string; onSuite: (s: Suite) => void; onYaml: (y: string) => void }) {
  const [tab, setTab] = useState<"prompts" | "tests" | "yaml">("prompts");
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["prompts", "tests", "yaml"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold capitalize", tab === t ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200")}>
            {t === "yaml" ? "YAML" : t} {t === "prompts" ? `(${suite.prompts.length})` : t === "tests" ? `(${suite.tests.length})` : ""}
          </button>
        ))}
      </div>
      {tab === "prompts" && <Prompts suite={suite} onSuite={onSuite} />}
      {tab === "tests" && <Tests suite={suite} onSuite={onSuite} />}
      {tab === "yaml" && <YamlTab yaml={yaml} onYaml={onYaml} />}
    </div>
  );
}

function Prompts({ suite, onSuite }: { suite: Suite; onSuite: (s: Suite) => void }) {
  const [active, setActive] = useState(0);
  const [diff, setDiff] = useState(false);
  const p = suite.prompts[Math.min(active, suite.prompts.length - 1)];
  const [baseIdx, setBaseIdx] = useState(0);
  const update = (patch: Partial<typeof p>) => onSuite({ ...suite, prompts: suite.prompts.map((x, i) => (i === active ? { ...x, ...patch } : x)) });
  const vars = useMemo(() => {
    try {
      return [...new Set([...extractVariables(p.template), ...extractVariables(p.system ?? "")])];
    } catch {
      return [];
    }
  }, [p]);
  const base = suite.prompts[baseIdx] ?? suite.prompts[0];
  const addVersion = () => {
    const id = `v${suite.prompts.length + 1}`;
    onSuite({ ...suite, prompts: [...suite.prompts, { ...p, id, label: `${id} - copy of ${p.id}` }] });
    setActive(suite.prompts.length);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {suite.prompts.map((x, i) => (
          <button key={x.id} onClick={() => setActive(i)} className={clsx("chip cursor-pointer px-3 py-1 text-sm", i === active && "border-gold-400/60 bg-gold-400/10 text-gold-300")}>
            {x.label ?? x.id}
          </button>
        ))}
        <button className="chip cursor-pointer" onClick={addVersion}>
          <Plus size={12} /> new version
        </button>
        {suite.prompts.length > 1 && (
          <button className={clsx("chip cursor-pointer", diff && "border-sky-400/50 text-sky-300")} onClick={() => setDiff((d) => !d)} data-testid="toggle-diff">
            <GitCompare size={12} /> diff
          </button>
        )}
      </div>
      {diff ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <select className="input w-auto py-1" value={baseIdx} onChange={(e) => setBaseIdx(Number(e.target.value))}>
              {suite.prompts.map((x, i) => (
                <option key={x.id} value={i}>
                  {x.id}
                </option>
              ))}
            </select>
            →<span className="font-mono text-gray-200">{p.id}</span>
          </div>
          <div className="label">system</div>
          <DiffView a={base.system ?? ""} b={p.system ?? ""} />
          <div className="label">template</div>
          <DiffView a={base.template} b={p.template} />
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div>
              <label className="label">id</label>
              <input className="input mono" value={p.id} onChange={(e) => update({ id: e.target.value.replace(/\s/g, "-") })} />
            </div>
            <div>
              <label className="label">label</label>
              <input className="input" value={p.label ?? ""} onChange={(e) => update({ label: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">system prompt (optional)</label>
            <textarea className="input mono min-h-[90px]" value={p.system ?? ""} onChange={(e) => update({ system: e.target.value || undefined })} spellCheck={false} />
          </div>
          <div>
            <label className="label">user template</label>
            <textarea className="input mono min-h-[160px]" value={p.template} onChange={(e) => update({ template: e.target.value })} spellCheck={false} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 text-xs text-gray-500">
              variables:{" "}
              {vars.length ? vars.map((v) => <span key={v} className="chip font-mono">{`{{${v}}}`}</span>) : <span>none</span>}
            </div>
            {suite.prompts.length > 1 && (
              <button className="btn-danger px-2 py-1 text-xs" onClick={() => (onSuite({ ...suite, prompts: suite.prompts.filter((_, i) => i !== active) }), setActive(0))}>
                <Trash2 size={13} /> delete version
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Templates support <code className="text-gray-300">{"{{var}}"}</code>, filters <code className="text-gray-300">{"{{x | upper}}"}</code>, <code className="text-gray-300">{"{{#if}}"}</code> and{" "}
            <code className="text-gray-300">{"{{#each}}"}</code>. No code execution - shared suites are safe to open.
          </p>
        </div>
      )}
    </div>
  );
}

function Tests({ suite, onSuite }: { suite: Suite; onSuite: (s: Suite) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const open = (i: number) => {
    setEditing(i);
    setDraft(YAML.stringify(JSON.parse(JSON.stringify(suite.tests[i])), { lineWidth: 0 }));
    setErr("");
  };
  const save = () => {
    try {
      const t = normalizeSuite({ tests: [YAML.parse(draft)] }).tests[0] as TestCase;
      onSuite({ ...suite, tests: suite.tests.map((x, i) => (i === editing ? t : x)) });
      setEditing(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const add = () => {
    const vars = Object.fromEntries(suite.prompts.flatMap((p) => extractVariables(p.template)).filter((v) => !(v in (suite.defaults?.vars ?? {}))).map((v) => [v, ""]));
    onSuite({ ...suite, tests: [...suite.tests, { id: `case-${suite.tests.length + 1}`, vars, assert: [{ type: "icontains", value: "" }] }] });
    setTimeout(() => open(suite.tests.length), 0);
  };
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs text-gray-400 uppercase">
            <tr>
              <th className="px-3 py-2">case</th>
              <th className="px-3 py-2">vars</th>
              <th className="px-3 py-2">assertions</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {suite.tests.map((t, i) => (
              <tr key={t.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => open(i)}>
                <td className="px-3 py-2 align-top">
                  <div className="font-mono text-gold-300">{t.id}</div>
                  {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                </td>
                <td className="max-w-xs px-3 py-2 align-top">
                  {Object.entries(t.vars).map(([k, v]) => (
                    <div key={k} className="truncate font-mono text-xs text-gray-400">
                      <span className="text-gray-500">{k}:</span> {stringify(v).slice(0, 80)}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {t.assert.map((a, j) => (
                      <span key={j} className="chip font-mono text-[10px]">
                        {a.not ? "not-" : ""}
                        {a.type}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <button
                    className="rounded p-1 text-gray-500 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSuite({ ...suite, tests: suite.tests.filter((_, k) => k !== i) });
                    }}
                    aria-label="delete case"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-ghost mt-3 text-xs" onClick={add}>
        <Plus size={14} /> Add case
      </button>
      {suite.defaults?.assert?.length ? (
        <p className="mt-2 text-xs text-gray-500">
          + default assertions on every case: {suite.defaults.assert.map((a) => (a.not ? "not-" : "") + a.type).join(", ")}
        </p>
      ) : null}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`Edit case`} wide>
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <div>
            <textarea className="input mono min-h-[360px]" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
            {err && <div className="mt-2 text-xs text-rose-300">{err}</div>}
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-gold" onClick={save}>
                Save case
              </button>
            </div>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-auto">
            <div className="label">assertion types</div>
            {ASSERTION_DOCS.map((d) => (
              <div key={d.type} className="rounded-lg bg-white/[0.03] p-2">
                <div className="font-mono text-xs text-gold-300">{d.type}</div>
                <div className="text-[11px] text-gray-400">{d.summary}</div>
              </div>
            ))}
            <div className="text-[11px] text-gray-500">Prefix any type with not- to invert it.</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function YamlTab({ yaml, onYaml }: { yaml: string; onYaml: (y: string) => void }) {
  const [text, setText] = useState(yaml);
  const [synced, setSynced] = useState(yaml);
  if (synced !== yaml) {
    setSynced(yaml);
    setText(yaml);
  }
  const issues = useMemo(() => {
    try {
      return validateSuite(normalizeSuite(YAML.parse(text)));
    } catch (e) {
      return [{ path: "(root)", message: (e as Error).message.split("\n")[0], severity: "error" as const }];
    }
  }, [text]);
  const errors = issues.filter((i) => i.severity === "error");
  return (
    <div className="space-y-2">
      <textarea className="input mono min-h-[460px]" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} data-testid="yaml-editor" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 text-xs">
          {issues.length === 0 && <span className="text-emerald-400">✓ valid suite</span>}
          {issues.slice(0, 6).map((i, k) => (
            <div key={k} className={i.severity === "error" ? "text-rose-300" : "text-amber-300"}>
              {i.severity === "error" ? "✗" : "⚠"} {i.path}: {i.message}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={() => setText(yaml)}>
            Revert
          </button>
          <button className="btn-gold text-xs" disabled={errors.length > 0 || text === yaml} onClick={() => onYaml(text)}>
            Apply YAML
          </button>
        </div>
      </div>
    </div>
  );
}

