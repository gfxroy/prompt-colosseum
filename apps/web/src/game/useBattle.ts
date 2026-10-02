import { useCallback, useEffect, useRef, useState } from "react";
import { cellScore, runBattle, scoreBattle, CHAMPION, PLAYER, type AssertionResult, type BattleResult, type Boss, type CellResult } from "@colosseum/core";
import { battleProvider } from "../lib/providers";
import { keyStore, settingsStore } from "../lib/state";
import { play } from "../lib/sound";

export interface RevealState {
  round: number;
  testId: string | null;
  player: AssertionResult[];
  champion: AssertionResult[];
  playerCell: CellResult | null;
  championCell: CellResult | null;
  playerHp: number;
  bossHp: number;
  hitPlayer: number;
  hitBoss: number;
  done: boolean[];
  log: { testId: string; player: number; champion: number }[];
}

const initialReveal = (): RevealState => ({ round: -1, testId: null, player: [], champion: [], playerCell: null, championCell: null, playerHp: 100, bossHp: 100, hitPlayer: 0, hitBoss: 0, done: [], log: [] });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Drives a battle: runs the suite (mock or live) and replays results as a paced, animated reveal. */
export function useBattle(boss: Boss) {
  const [phase, setPhase] = useState<"prep" | "fight" | "verdict" | "error">("prep");
  const [reveal, setReveal] = useState<RevealState>(initialReveal);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, retry: "" });
  const abort = useRef<AbortController | null>(null);
  const skip = useRef(false);

  useEffect(() => () => abort.current?.abort(), []);

  const fight = useCallback(
    async (playerPrompt: string, onFinish: (r: BattleResult) => void) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      skip.current = false;
      setPhase("fight");
      setReveal(initialReveal());
      setResult(null);
      setError(null);
      const cells = new Map<string, CellResult>();
      let notify: (() => void) | null = null;
      const k = keyStore.get();
      const { cfg, provider, live } = battleProvider(k);
      setProgress({ done: 0, total: boss.cases.length * 2, retry: "" });
      const runP = runBattle({
        spec: { boss, playerPrompt },
        providerConfig: cfg,
        provider,
        live,
        signal: ctrl.signal,
        concurrency: live ? 2 : 4,
        rpm: live && cfg.type === "gemini" ? 14 : live ? 60 : 0,
        onEvent: (e) => {
          if (e.type === "cell-done") {
            cells.set(`${e.cell.promptId}|${e.cell.testId}`, e.cell);
            setProgress((p) => ({ ...p, done: e.done, total: e.total, retry: "" }));
            notify?.();
          } else if (e.type === "retry") setProgress((p) => ({ ...p, retry: `rate limited - retrying in ${Math.round(e.waitMs / 1000)}s` }));
        },
      }).catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
        throw e;
      });
      runP.catch(() => {});
      const per = 100 / boss.cases.length;
      let playerHp = 100;
      let bossHp = 100;
      const step = () => (skip.current ? 0 : 420 / settingsStore.get().speed);
      try {
        for (let i = 0; i < boss.cases.length; i++) {
          const t = boss.cases[i];
          while (!(cells.has(`${PLAYER}|${t.id}`) && cells.has(`${CHAMPION}|${t.id}`))) {
            if (ctrl.signal.aborted) return;
            await new Promise<void>((r) => {
              notify = r;
              setTimeout(r, 250);
            });
          }
          const pc = cells.get(`${PLAYER}|${t.id}`)!;
          const cc = cells.get(`${CHAMPION}|${t.id}`)!;
          setReveal((r) => ({ ...r, round: i, testId: t.id, player: [], champion: [], playerCell: pc, championCell: cc, hitBoss: 0, hitPlayer: 0 }));
          await wait(step() * 1.2);
          const n = Math.max(pc.assertions.length, cc.assertions.length, 1);
          for (let j = 0; j < n; j++) {
            if (ctrl.signal.aborted) return;
            const pa = pc.assertions[j];
            const ca = cc.assertions[j];
            setReveal((r) => ({ ...r, player: pa ? [...r.player, pa] : r.player, champion: ca ? [...r.champion, ca] : r.champion }));
            if (!skip.current && pa) play(pa.pass ? "pass" : "fail");
            await wait(step());
          }
          const dp = per * (1 - cellScore(pc));
          const db = per * (1 - cellScore(cc));
          playerHp -= dp;
          bossHp -= db;
          if (!skip.current && (dp > 0 || db > 0)) play("hit");
          setReveal((r) => ({
            ...r,
            playerHp: Math.max(0, playerHp),
            bossHp: Math.max(0, bossHp),
            hitPlayer: dp,
            hitBoss: db,
            done: [...r.done, true],
            log: [...r.log, { testId: t.id, player: cellScore(pc), champion: cellScore(cc) }],
          }));
          await wait(step() * 1.6);
        }
        await runP;
        const all = [...cells.values()];
        if (all.length && all.every((c) => c.error)) {
          setError(all[0].error ?? "every request failed");
          setPhase("error");
          return;
        }
        const final = scoreBattle(boss, all, live);
        setResult(final);
        setPhase("verdict");
        onFinish(final);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
          setPhase("error");
        }
      }
    },
    [boss],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    setPhase("prep");
  }, []);
  const skipAnimation = useCallback(() => {
    skip.current = true;
  }, []);
  const reset = useCallback(() => {
    abort.current?.abort();
    setPhase("prep");
    setResult(null);
  }, []);

  return { phase, reveal, result, error, progress, fight, cancel, skipAnimation, reset };
}
