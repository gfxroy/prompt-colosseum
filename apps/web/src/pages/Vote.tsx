import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Shuffle, Scale } from "lucide-react";
import { applyVote, buildMessages, createProvider, evaluateAssertion, recordVote, scoreCase, type Suite } from "@colosseum/core";
import { EXAMPLES, exampleSuite } from "../demo/examples";
import { RECORDINGS } from "../lib/providers";
import { leaderboardStore, progressStore } from "../lib/state";
import { play } from "../lib/sound";
import { sparkle } from "../lib/fx";
import { toast } from "../components/toast";

interface Contestant {
  id: string;
  label: string;
  model: string;
  output: string;
  source: string;
  pass: boolean;
  score: number;
}
interface Pair {
  suite: string;
  testId: string;
  input: string;
  a: Contestant;
  b: Contestant;
}

const SUITES: Suite[] = EXAMPLES.map((e) => exampleSuite(e.id));
const short = (s: string) => s.replace(/ & .*$/, "").replace(/Customer-support/, "Support");

async function makePair(): Promise<Pair> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const suite = SUITES[Math.floor(Math.random() * SUITES.length)];
    const test = suite.tests[Math.floor(Math.random() * suite.tests.length)];
    const combos = suite.prompts.flatMap((p) => suite.providers.map((pr) => ({ p, pr })));
    const i = Math.floor(Math.random() * combos.length);
    let j = Math.floor(Math.random() * (combos.length - 1));
    if (j >= i) j++;
    const vars = { ...(suite.defaults?.vars ?? {}), ...test.vars };
    const judgeCfg = suite.providers.find((x) => x.id === suite.judge?.provider);
    const judgeP = judgeCfg ? createProvider(judgeCfg, { keys: {}, recordings: RECORDINGS }) : undefined;
    const contestants = await Promise.all(
      [combos[i], combos[j]].map(async ({ p, pr }) => {
        const { messages } = buildMessages(p, vars);
        const provider = createProvider(pr, { keys: {}, recordings: RECORDINGS });
        const res = await provider.complete({ messages, temperature: pr.temperature, seed: 0, meta: { system: p.system, template: p.template, vars } });
        const results = [];
        for (const spec of [...(suite.defaults?.assert ?? []), ...test.assert])
          results.push(await evaluateAssertion(spec, { output: res.text, vars, messages, latencyMs: res.latencyMs, usage: res.usage, costUsd: 0, judge: judgeP ? (m) => judgeP.complete({ messages: m, temperature: 0 }) : undefined }));
        const sc = scoreCase(results);
        return {
          id: `${suite.name}|${p.id}|${pr.id}`,
          label: `${short(suite.name)} · ${p.label ?? p.id} · ${pr.label ?? pr.model}`,
          model: pr.label ?? pr.model,
          output: res.text,
          source: res.source,
          pass: sc.pass,
          score: sc.score,
        } satisfies Contestant;
      }),
    );
    if (contestants[0].output.trim() === contestants[1].output.trim()) continue;
    const input = buildMessages(suite.prompts[0], vars).messages.at(-1)!.content;
    return { suite: suite.name, testId: test.id, input: Object.entries(test.vars).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n") || input, a: contestants[0], b: contestants[1] };
  }
  throw new Error("could not build a pair");
}

export default function Vote() {
  const lb = leaderboardStore.use();
  const [pair, setPair] = useState<Pair | null>(null);
  const [voted, setVoted] = useState<"a" | "b" | "tie" | null>(null);
  const [tab, setTab] = useState<"prompts" | "models">("prompts");
  const next = useCallback(async () => {
    setVoted(null);
    setPair(null);
    setPair(await makePair());
  }, []);
  useEffect(() => {
    next();
  }, [next]);

  const vote = useCallback(
    (o: "a" | "b" | "tie") => {
      if (!pair || voted) return;
      setVoted(o);
      play("click");
      const testsPrefer = pair.a.score === pair.b.score ? "tie" : pair.a.score > pair.b.score ? "a" : "b";
      leaderboardStore.set((s) => {
        let board = recordVote(s.board, { id: pair.a.id, label: pair.a.label }, { id: pair.b.id, label: pair.b.label }, o);
        if (pair.a.model !== pair.b.model) board = recordVote(board, { id: `model:${pair.a.model}`, label: pair.a.model }, { id: `model:${pair.b.model}`, label: pair.b.model }, o);
        return { board, votes: s.votes + 1, agreed: s.agreed + (testsPrefer === o ? 1 : 0) };
      });
      const r = applyVote(progressStore.get());
      progressStore.set(r.progress);
      r.newBadges.forEach((b) => toast({ emoji: b.emoji, title: `Badge unlocked: ${b.name}`, body: b.description }));
      if (testsPrefer === o) sparkle(0.5, 0.4);
    },
    [pair, voted],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft" || e.key === "1") vote("a");
      if (e.key === "ArrowDown" || e.key === "2") vote("tie");
      if (e.key === "ArrowRight" || e.key === "3") vote("b");
      if ((e.key === "Enter" || e.key === " ") && voted) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote, voted, next]);

  const entries = Object.values(lb.board)
    .filter((e) => (tab === "models" ? e.id.startsWith("model:") : !e.id.startsWith("model:")))
    .sort((x, y) => y.rating - x.rating);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-white">Blind Vote</h1>
            <p className="text-gray-400">Which answer is better? Identities are hidden until you vote. Keys: ← tie ↓ →</p>
          </div>
          <span className="chip">
            {lb.votes} votes · agree with tests {lb.votes ? Math.round((lb.agreed / lb.votes) * 100) : 0}%
          </span>
        </div>
        {!pair ? (
          <div className="card flex h-64 items-center justify-center text-gray-500">Summoning two gladiators…</div>
        ) : (
          <>
            <div className="card p-4">
              <div className="label">
                {pair.suite} · <span className="font-mono normal-case">{pair.testId}</span>
              </div>
              <pre className="mono max-h-40 overflow-auto text-xs whitespace-pre-wrap text-gray-400">{pair.input}</pre>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(["a", "b"] as const).map((side) => {
                const c = pair[side];
                const won = voted && (voted === side || voted === "tie");
                return (
                  <div key={side} className={clsx("card flex flex-col p-4 transition", voted && (won ? "border-gold-400/50" : "opacity-70"))} data-testid={`vote-${side}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-lg font-black text-white">{side.toUpperCase()}</span>
                      {voted && (
                        <span className={clsx("chip", c.pass ? "border-emerald-400/40 text-emerald-300" : "border-rose-400/40 text-rose-300")}>tests {c.pass ? "✓ pass" : `✗ ${Math.round(c.score * 100)}%`}</span>
                      )}
                    </div>
                    <pre className="mono max-h-80 flex-1 overflow-auto rounded-xl bg-ink-950 p-3 text-xs whitespace-pre-wrap text-gray-300">{c.output}</pre>
                    {voted && (
                      <div className="animate-pop mt-3 text-sm">
                        <div className="font-bold text-gold-300">{c.label}</div>
                        <div className="text-xs text-gray-500">{c.source === "recorded" ? "real response, recorded from the API" : c.source === "mock" ? "mock-1 simulator" : "live"}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {!voted ? (
                <>
                  <button className="btn-gold px-6" onClick={() => vote("a")} data-testid="vote-a-btn">
                    ← A is better
                  </button>
                  <button className="btn-ghost px-6" onClick={() => vote("tie")}>
                    <Scale size={15} /> Tie
                  </button>
                  <button className="btn-gold px-6" onClick={() => vote("b")}>
                    B is better →
                  </button>
                </>
              ) : (
                <button className="btn-gold px-8" onClick={next} data-testid="vote-next">
                  <Shuffle size={15} /> Next pair (Enter)
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <aside className="card h-fit p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="label !mb-0">Your leaderboard</div>
          <div className="flex gap-1">
            {(["prompts", "models"] as const).map((t) => (
              <button key={t} className={clsx("rounded-lg px-2 py-0.5 text-xs font-semibold", tab === t ? "bg-white/10 text-white" : "text-gray-500")} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">Vote to rank {tab === "models" ? "models" : "prompt versions × models"}. Each vote is an Elo match.</p>
        ) : (
          <ol className="space-y-1.5">
            {entries.map((e, i) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-xs">
                <span className="w-5 text-center font-black text-gray-500">{i === 0 ? "👑" : i + 1}</span>
                <span className="flex-1 truncate text-gray-300" title={e.label}>
                  {e.label}
                </span>
                <span className="font-mono font-bold text-white">{e.rating}</span>
                <span className="w-14 text-right text-gray-500">
                  {e.wins}-{e.losses}-{e.ties}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-[11px] text-gray-500">Pairs come from the example suites: real Gemini responses recorded via the CLI, and the mock-1 simulator. Labels are revealed after you vote.</p>
      </aside>
    </div>
  );
}
