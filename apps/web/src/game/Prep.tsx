import { useRef, useState } from "react";
import { Eye, EyeOff, Swords, Lightbulb, Info, Zap } from "lucide-react";
import { stringify, tierFor, type Boss } from "@colosseum/core";
import { isLiveMode, keyStore } from "../lib/state";

function short(v: unknown, n = 280) {
  const s = stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function Prep({ boss, prompt, setPrompt, onFight, attempts, daily, twist }: { boss: Boss; prompt: string; setPrompt: (s: string) => void; onFight: () => void; attempts: number; daily?: boolean; twist?: string }) {
  const [showChampion, setShowChampion] = useState(false);
  const k = keyStore.use();
  const live = isLiveMode(k);
  const ta = useRef<HTMLTextAreaElement>(null);
  const t = tierFor(boss.rating);
  const insert = (v: string) => {
    const el = ta.current;
    const token = `{{${v}}}`;
    if (!el) return setPrompt(prompt + token);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    setPrompt(prompt.slice(0, a) + token + prompt.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + token.length;
    });
  };
  const champion = boss.edits === "system" ? boss.champion.system ?? "" : boss.champion.template;
  const examples = boss.cases.slice(0, boss.visible);
  const missingVars = boss.variables.filter((v) => !prompt.includes(`{{${v}}}`) && !prompt.includes(`{{ ${v} }}`));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="card relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -top-6 -right-4 text-[140px] leading-none opacity-10 select-none">{boss.emoji}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500 uppercase">
            {daily ? <span className="chip border-orange-400/40 text-orange-300">📅 Daily Duel</span> : <span className="chip">Level {boss.level}</span>}
            <span className="chip" style={{ color: t.color, borderColor: `${t.color}55` }}>
              {t.emoji} Elo {boss.rating}
            </span>
            {twist && <span className="chip border-violet-400/40 text-violet-300">{twist}</span>}
            {attempts > 0 && <span className="chip">attempt #{attempts + 1}</span>}
          </div>
          <div className="mt-4 flex items-center gap-5">
            <div className="animate-bob text-7xl drop-shadow-[0_8px_24px_rgba(249,115,22,0.35)]">{boss.emoji}</div>
            <div>
              <h1 className="text-3xl font-black text-white" data-testid="boss-name">
                {boss.name}
              </h1>
              <div className="text-gray-400">{boss.title}</div>
              <div className="mt-3 inline-block rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200 italic">“{boss.taunt}”</div>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-gold-400/20 bg-gold-400/5 p-4 text-sm text-gray-200">
            <b className="text-gold-300">Your mission: </b>
            {boss.brief}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="prompt" className="label !mb-0">
              {boss.edits === "system" ? "Your system prompt" : "Your prompt template"}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">insert:</span>
              {boss.variables.map((v) => (
                <button key={v} className="chip font-mono hover:border-gold-400/50 hover:text-gold-300" onClick={() => insert(v)}>{`{{${v}}}`}</button>
              ))}
            </div>
          </div>
          <textarea
            id="prompt"
            ref={ta}
            data-testid="prompt-editor"
            className="input mono min-h-[220px] resize-y"
            value={prompt}
            spellCheck={false}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onFight();
            }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              {prompt.length} chars{boss.edits === "system" && boss.fixedTemplate ? ` · user message is ${boss.fixedTemplate}` : ""}
              {missingVars.length > 0 && <span className="ml-2 text-amber-300">⚠ not using {missingVars.map((v) => `{{${v}}}`).join(", ")} - the model won't see that data</span>}
            </span>
            <span className="hidden sm:inline">⌘/Ctrl + Enter to fight</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className={`flex items-center gap-2 text-sm ${live ? "text-emerald-300" : "text-gray-400"}`}>
              <Zap size={15} />
              {live ? (
                <span>
                  Live: <b>{k.active?.model}</b> · ~{boss.cases.length * 2} requests + judge calls
                </span>
              ) : (
                <span>
                  Demo: <b className="text-gray-200">mock-1</b> simulator - deterministic, rewards explicit instructions
                </span>
              )}
            </div>
            <button className="btn-gold animate-glow px-8 py-3 text-base" onClick={onFight} disabled={!prompt.trim()} data-testid="fight">
              <Swords size={18} /> FIGHT
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-5">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowChampion((s) => !s)}>
            <span className="label !mb-0">The champion's prompt</span>
            {showChampion ? <EyeOff size={15} className="text-gray-400" /> : <Eye size={15} className="text-gray-400" />}
          </button>
          {showChampion ? (
            <pre className="mono mt-3 max-h-64 overflow-auto rounded-xl bg-ink-950 p-3 whitespace-pre-wrap text-gray-300">{champion}</pre>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Know thy enemy. Peek at the prompt you need to out-score.</p>
          )}
        </div>
        <div className="card p-5">
          <div className="label">Example case{examples.length > 1 ? "s" : ""} · {boss.cases.length - examples.length} more hidden</div>
          <div className="space-y-3">
            {examples.map((c) => (
              <div key={c.id} className="rounded-xl bg-ink-950/70 p-3">
                <div className="mb-1 font-mono text-xs text-gold-300">{c.id}</div>
                {Object.entries(c.vars)
                  .filter(([kk]) => kk !== "secret" && kk !== "records" && kk !== "policy")
                  .map(([kk, v]) => (
                    <div key={kk} className="mono text-xs text-gray-400">
                      <span className="text-gray-500">{kk}:</span> <span className="whitespace-pre-wrap">{short(v)}</span>
                    </div>
                  ))}
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.assert.map((a, i) => (
                    <span key={i} className="chip font-mono text-[10px]">
                      {a.not ? "not-" : ""}
                      {a.type}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="label flex items-center gap-1.5">
            <Lightbulb size={13} /> Tactics
          </div>
          <ul className="space-y-1.5 text-sm text-gray-400">
            {boss.tips.map((tip) => (
              <li key={tip}>• {tip}</li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/5 p-2 text-[11px] text-gray-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            Same model, same cases for both sides. Each case is worth {Math.round(100 / boss.cases.length)} HP; partial credit per assertion.
          </div>
        </div>
      </aside>
    </div>
  );
}
