import { useEffect, useRef, useState } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { BOSSES, dailyBoss, dayKey, levelHint, runLevel, shareText, squares, type Boss, type CellResult, type LevelResult } from "@colosseum/core";
import { currentStreak, isUnlocked, progressStore, recordDaily, recordLevel } from "./lib/progress";
import { aiFor, isRealAI, keyStore, MODELS } from "./lib/ai";
import { renderShareCard } from "./lib/shareCard";
import { copyText } from "./lib/download";

const CONCEPT = "Write one prompt that makes the AI pass all 5 checks.";
const URL_ = "https://gfxroy.github.io/prompt-colosseum/";

export default function App() {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <HashRouter>
      <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col px-5 sm:px-6">
        <Header onKey={() => setKeyOpen(true)} />
        <main className="flex-1 pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/level/:n" element={<LevelRoute />} />
            <Route path="/daily" element={<Game boss={dailyBoss(dayKey())} daily />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="border-t border-line py-6 text-sm text-faint">
          <a className="btn-text !text-faint hover:!text-fg" href="https://github.com/gfxroy/prompt-colosseum#for-developers" target="_blank" rel="noreferrer">
            For developers → CLI
          </a>
        </footer>
      </div>
      <HowTo />
      {keyOpen && <KeyDialog onClose={() => setKeyOpen(false)} />}
    </HashRouter>
  );
}

function Header({ onKey }: { onKey: () => void }) {
  const k = keyStore.use();
  const live = isRealAI(k);
  return (
    <header className="flex h-16 items-center justify-between">
      <Link to="/" className="text-[15px] font-medium tracking-tight">
        Prompt Colosseum
      </Link>
      <div className="flex items-center gap-4">
        <span data-testid="mode-badge" className="rounded border border-line px-1.5 py-0.5 text-[11px] text-faint">
          {live ? "Real AI" : "Demo"}
        </span>
        <button className="btn-text" onClick={onKey} data-testid="key-link">
          {live ? k.active!.model : "Use real AI"}
        </button>
      </div>
    </header>
  );
}

function HowTo() {
  const p = progressStore.use();
  if (p.seenHowTo) return null;
  return (
    <div className="fade fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6 backdrop-blur-sm" data-testid="howto">
      <div className="w-full max-w-sm rounded-lg border border-line bg-raised p-7">
        <h2 className="text-lg font-semibold tracking-tight">How to play</h2>
        <ol className="mt-4 space-y-2.5 text-[15px] text-mute">
          <li>1. Each level has a goal and 5 hidden checks.</li>
          <li>2. Write one prompt telling the AI what to do.</li>
          <li>3. Press Fight. Pass all 5 checks to win.</li>
        </ol>
        <button className="btn-primary mt-7 w-full" onClick={() => progressStore.set((s) => ({ ...s, seenHowTo: true }))} data-testid="howto-ok">
          Got it
        </button>
      </div>
    </div>
  );
}

function KeyDialog({ onClose }: { onClose: () => void }) {
  const k = keyStore.use();
  const [kind, setKind] = useState<"gemini" | "openai">((k.active?.type as "gemini" | "openai") ?? "gemini");
  const [key, setKey] = useState("");
  const has = kind === "gemini" ? Boolean(k.keys.gemini) : Boolean(k.keys.openai);
  const save = () => {
    keyStore.set((s) => ({ keys: { ...s.keys, ...(key.trim() ? { [kind]: key.trim() } : {}) }, active: { id: "live", type: kind, model: MODELS[kind] } }));
    onClose();
  };
  return (
    <div className="fade fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-line bg-raised p-7" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold tracking-tight">Use real AI</h2>
        <p className="mt-2 text-sm text-mute">Without a key, a simulated AI plays. Your key stays in this tab and is sent only to the provider.</p>
        <div className="mt-5 grid grid-cols-2 rounded-md border border-line p-0.5 text-sm">
          {(["gemini", "openai"] as const).map((t) => (
            <button key={t} onClick={() => setKind(t)} className={`rounded py-1.5 transition-colors duration-150 ${kind === t ? "bg-fg text-ink" : "text-mute hover:text-fg"}`}>
              {t === "gemini" ? "Gemini" : "OpenAI"}
            </button>
          ))}
        </div>
        <input id="apikey" type="password" autoComplete="off" className="field mt-3" placeholder={has ? "Key saved" : kind === "gemini" ? "Gemini API key" : "OpenAI API key"} value={key} onChange={(e) => setKey(e.target.value)} />
        <p className="mt-2 text-xs text-faint">Model: {MODELS[kind]}</p>
        <button className="btn-primary mt-6 w-full" disabled={!key.trim() && !has} onClick={save} data-testid="save-key">
          Save
        </button>
        <div className="mt-4 flex justify-between">
          <button className="btn-text" onClick={onClose}>
            Cancel
          </button>
          {(k.keys.gemini || k.keys.openai) && (
            <button className="btn-text" onClick={() => (keyStore.reset(), onClose())}>
              Remove key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Home() {
  const p = progressStore.use();
  const today = dayKey();
  const d = dailyBoss(today);
  const done = p.daily[today];
  return (
    <div className="fade pt-10 sm:pt-16">
      <h1 className="text-[32px] leading-[1.15] font-semibold tracking-tight sm:text-[40px]">{CONCEPT}</h1>
      <div className="mt-5 flex gap-6 text-sm text-mute">
        <span>
          Levels <span className="text-fg">{p.cleared.length}/10</span>
        </span>
        <span>
          Streak <span className="text-fg">{currentStreak(p, today)}</span>
        </span>
      </div>

      <Link to="/daily" className="mt-10 block rounded-lg border border-line p-5 transition-colors duration-150 hover:border-line-strong" data-testid="cta-daily">
        <div className="flex items-center justify-between text-sm text-mute">
          <span>Today's challenge · #{d.daily}</span>
          <span className="text-fg">{done ? `${done.squares} ${done.passed}/${done.total}` : "Play →"}</span>
        </div>
        <div className="mt-2 text-[15px] text-fg">{d.goal}</div>
      </Link>

      <h2 className="mt-12 text-sm text-mute">Levels</h2>
      <ol className="mt-3 border-t border-line">
        {BOSSES.map((b) => {
          const open = isUnlocked(p, b.level);
          const cleared = p.cleared.includes(b.id);
          const row = (
            <>
              <span className="w-7 shrink-0 tabular-nums text-faint">{String(b.level).padStart(2, "0")}</span>
              <span className={`flex-1 ${open ? "text-fg" : "text-faint"}`}>{b.goal}</span>
              <span className="w-10 shrink-0 text-right text-mute">{cleared ? "✓" : open ? `${p.best[b.id] ?? 0}/5` : "—"}</span>
            </>
          );
          return (
            <li key={b.id} className="border-b border-line">
              {open ? (
                <Link to={`/level/${b.level}`} className="flex gap-3 py-4 text-[15px] transition-opacity duration-150 hover:opacity-70" data-testid={`level-${b.level}`}>
                  {row}
                </Link>
              ) : (
                <div className="flex gap-3 py-4 text-[15px]" aria-disabled data-testid={`level-${b.level}`}>
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LevelRoute() {
  const n = Number(useParams().n);
  const p = progressStore.use();
  const boss = BOSSES[n - 1];
  if (!boss || !isUnlocked(p, n)) return <Navigate to="/" replace />;
  return <Game key={boss.id} boss={boss} />;
}

type Phase = "write" | "fight" | "done";

function Game({ boss, daily }: { boss: Boss & { daily?: number; day?: string }; daily?: boolean }) {
  const nav = useNavigate();
  const draftKey = `colosseum.draft.${daily ? "daily" : boss.id}`;
  const [prompt, setPrompt] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [phase, setPhase] = useState<Phase>("write");
  const [cells, setCells] = useState<Record<string, CellResult>>({});
  const [shown, setShown] = useState(0);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const live = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);

  // Reveal checks one by one, in order, as their results arrive.
  useEffect(() => {
    if (phase !== "fight" && phase !== "done") return;
    if (shown >= boss.cases.length || !cells[boss.cases[shown].id]) return;
    const t = setTimeout(() => setShown((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [phase, shown, cells, boss.cases]);

  const allShown = result && shown >= boss.cases.length;
  const title = daily ? `Daily #${boss.daily}` : `Level ${boss.level}`;

  useEffect(() => {
    if (!allShown || !result) return;
    if (daily) recordDaily(boss.day!, { passed: result.passed, total: result.total, squares: squares(result) });
    else recordLevel(boss.id, result.passed, result.total);
  }, [allShown, result, daily, boss.id, boss.day]);

  const fight = async () => {
    if (!prompt.trim()) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase("fight");
    setCells({});
    setShown(0);
    setResult(null);
    setError("");
    setOpen(null);
    const ai = aiFor(keyStore.get());
    live.current = ai.live;
    try {
      const r = await runLevel({
        boss,
        prompt,
        providerConfig: ai.cfg,
        provider: ai.provider,
        live: ai.live,
        signal: ctrl.signal,
        concurrency: ai.live ? 2 : 5,
        rpm: ai.live && ai.cfg.type === "gemini" ? 14 : ai.live ? 60 : 0,
        onEvent: (e) => e.type === "cell-done" && setCells((c) => ({ ...c, [e.cell.testId]: e.cell })),
      });
      if (!ctrl.signal.aborted) {
        setResult(r);
        setPhase("done");
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError((e as Error).message);
        setPhase("write");
      }
    }
  };

  const nextLevel = !daily && boss.level < 10 ? `/level/${boss.level + 1}` : "/";

  return (
    <div className="fade pt-8 sm:pt-12">
      <div className="flex items-center justify-between text-sm text-mute">
        <Link to="/" className="btn-text">
          ← Levels
        </Link>
        <span>{title}</span>
      </div>
      <h1 className="mt-6 text-[26px] leading-snug font-semibold tracking-tight sm:text-[30px]" data-testid="goal">
        {boss.goal}
      </h1>

      <textarea
        data-testid="prompt-editor"
        className="field mt-8 min-h-[150px] resize-y"
        placeholder={boss.edits === "system" ? "Write the AI's rules…" : "Write your prompt…"}
        value={prompt}
        disabled={phase === "fight"}
        onChange={(e) => {
          setPrompt(e.target.value);
          localStorage.setItem(draftKey, e.target.value);
        }}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && fight()}
      />
      <p className="mt-2 text-xs text-faint">
        {boss.edits === "system" ? "Your text becomes the AI's system prompt. " : ""}
        {Object.keys(boss.inputs).length ? `The ${Object.values(boss.inputs).map((s) => s.toLowerCase()).join(", ")} ${Object.keys(boss.inputs).length > 1 ? "are" : "is"} attached automatically.` : ""}
      </p>
      {error && <p className="mt-3 text-sm text-mute">Error: {error}</p>}

      {phase === "write" && (
        <button className="btn-primary mt-6 w-full sm:w-auto" disabled={!prompt.trim()} onClick={fight} data-testid="fight">
          Fight
        </button>
      )}

      {phase !== "write" && (
        <ul className="mt-10 border-t border-line" data-testid="checks">
          {boss.cases.map((c, i) => {
            const cell = cells[c.id];
            const revealed = i < shown;
            const pass = revealed && cell?.pass;
            const failed = cell && !cell.pass ? cell.assertions.find((a) => !a.pass)?.reason || cell.error : "";
            return (
              <li key={c.id} className="border-b border-line" data-testid={`check-${i}`} data-state={!revealed ? "pending" : pass ? "pass" : "fail"}>
                <button className="flex w-full items-center gap-4 py-3.5 text-left text-[15px]" disabled={!revealed} onClick={() => setOpen(open === i ? null : i)}>
                  <span className={`w-4 text-center ${!revealed ? "breathe text-faint" : pass ? "text-fg" : "text-faint"}`}>{!revealed ? "·" : pass ? "✓" : "✕"}</span>
                  <span className={`flex-1 transition-colors duration-200 ${!revealed ? "text-faint" : pass ? "text-fg" : "text-mute"}`}>{c.description}</span>
                </button>
                {open === i && cell && (
                  <div className="fade pb-4 pl-8 text-sm text-mute">
                    {failed && <p className="mb-2 text-faint">{failed}</p>}
                    <p className="whitespace-pre-wrap break-words">{cell.output || "(empty reply)"}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {allShown && result && (
        <Result
          result={result}
          title={title}
          live={live.current}
          onRetry={() => setPhase("write")}
          onNext={() => nav(daily ? "/" : nextLevel)}
          nextLabel={daily ? "Back to levels" : boss.level < 10 ? "Next level" : "Back to levels"}
        />
      )}
    </div>
  );
}

function Result({ result, title, live, onRetry, onNext, nextLabel }: { result: LevelResult; title: string; live: boolean; onRetry: () => void; onNext: () => void; nextLabel: string }) {
  const [png, setPng] = useState("");
  const [copied, setCopied] = useState(false);
  const text = shareText({ result, title, url: URL_ });
  const hint = levelHint(result);
  useEffect(() => {
    renderShareCard(result, title).then(setPng);
  }, [result, title]);
  return (
    <div className="fade mt-10" data-testid="result" data-won={result.won}>
      <div className="text-[28px] font-semibold tracking-tight" data-testid="verdict-title">
        {result.won ? "You win" : `${result.passed}/${result.total} — try again`}
      </div>
      {hint && <p className="mt-2 text-[15px] text-mute">{hint}</p>}
      {!live && <p className="mt-2 text-xs text-faint">Demo: a simulated AI played. Use real AI for the real test.</p>}
      <button className="btn-primary mt-6 w-full sm:w-auto" onClick={result.won ? onNext : onRetry} data-testid={result.won ? "next" : "retry"}>
        {result.won ? nextLabel : "Try again"}
      </button>

      <div className="mt-12 border-t border-line pt-6" data-testid="share-card">
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-mute" data-testid="share-text">
          {text}
        </pre>
        {png && <img src={png} alt="Share card" className="mt-4 w-full rounded-md border border-line" data-testid="share-png" />}
        <div className="mt-3 flex gap-5">
          <button
            className="btn-text"
            onClick={async () => {
              setCopied(await copyText(text));
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy text"}
          </button>
          {png && (
            <a className="btn-text" href={png} download={`prompt-colosseum-${title.toLowerCase().replace(/\W+/g, "-")}.png`}>
              Save image
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
