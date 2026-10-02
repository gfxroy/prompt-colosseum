import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { applyBattle, BOSSES, bossById, dailyBoss, dayKey, emojiRow, type ApplyOutcome, type BattleResult, type Boss } from "@colosseum/core";
import { useBattle } from "../game/useBattle";
import Prep from "../game/Prep";
import Arena from "../game/Arena";
import Verdict from "../game/Verdict";
import { progressStore } from "../lib/state";
import { play } from "../lib/sound";
import { boo, celebrate } from "../lib/fx";
import { toast } from "../components/toast";

const draftKey = (id: string) => `colosseum.draft.${id}`;

export default function BattlePage({ daily }: { daily?: boolean }) {
  const { bossId } = useParams();
  const day = dayKey();
  const boss: (Boss & { twist?: string; duel?: number }) | undefined = useMemo(() => (daily ? dailyBoss(day) : bossById(bossId ?? "")), [daily, day, bossId]);
  if (!boss) return <Navigate to="/campaign" replace />;
  return <Battle key={boss.id} boss={boss} daily={daily} day={day} />;
}

function Battle({ boss, daily, day }: { boss: Boss & { twist?: string; duel?: number }; daily?: boolean; day: string }) {
  const p = progressStore.use();
  const idx = BOSSES.findIndex((b) => b.id === boss.id);
  const locked = !daily && idx > 0 && !p.campaignCleared.includes(BOSSES[idx - 1].id) && !p.campaignCleared.includes(boss.id);
  const [prompt, setPromptState] = useState(() => localStorage.getItem(draftKey(boss.id)) ?? boss.starter);
  const setPrompt = (s: string) => {
    setPromptState(s);
    localStorage.setItem(draftKey(boss.id), s);
  };
  const battle = useBattle(boss);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" }); // newer browsers return a Promise here - never return it from an effect
  }, [battle.phase]);

  const onFinish = (r: BattleResult) => {
    const mode = daily ? "daily" : "campaign";
    const o = applyBattle(progressStore.get(), r, {
      bossId: boss.id,
      bossRating: boss.rating,
      mode,
      day: daily ? day : undefined,
      emoji: emojiRow(r),
      promptLength: prompt.length,
      campaignIds: BOSSES.map((b) => b.id),
    });
    progressStore.set(o.progress);
    setOutcome(o);
    if (r.verdict === "victory") {
      play("victory");
      celebrate();
    } else if (r.verdict === "defeat") {
      play("defeat");
      boo();
    } else play("draw");
    o.newBadges.forEach((b, i) => setTimeout(() => (play("badge"), toast({ emoji: b.emoji, title: `Badge unlocked: ${b.name}`, body: b.description })), 900 + i * 600));
    if (o.leveledUp) setTimeout(() => (play("levelup"), toast({ emoji: "⬆️", title: "Level up!", body: "New level reached" })), 600);
  };

  if (locked)
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="text-6xl grayscale">{boss.emoji}</div>
        <h1 className="mt-3 text-2xl font-black text-white">{boss.name} is locked</h1>
        <p className="mt-2 text-gray-400">Defeat {BOSSES[idx - 1].name} first.</p>
        <Link to={`/battle/${BOSSES[idx - 1].id}`} className="btn-gold mt-5">
          Fight {BOSSES[idx - 1].name}
        </Link>
      </div>
    );

  const next = !daily && outcome?.progress.campaignCleared.includes(boss.id) && idx < BOSSES.length - 1 ? `/battle/${BOSSES[idx + 1].id}` : daily ? "/campaign" : null;

  return (
    <div>
      {battle.phase === "prep" && <Prep boss={boss} prompt={prompt} setPrompt={setPrompt} onFight={() => battle.fight(prompt, onFinish)} attempts={p.attempts[boss.id] ?? 0} daily={daily} twist={boss.twist} />}
      {battle.phase === "fight" && <Arena boss={boss} reveal={battle.reveal} progress={battle.progress} onSkip={battle.skipAnimation} onCancel={battle.cancel} />}
      {battle.phase === "verdict" && battle.result && outcome && (
        <Verdict boss={boss} result={battle.result} outcome={outcome} mode={daily ? "daily" : "campaign"} day={daily ? day : undefined} onRematch={battle.reset} nextHref={next} />
      )}
      {battle.phase === "error" && (
        <div className="card mx-auto max-w-xl border-rose-500/30 p-6">
          <h2 className="text-xl font-bold text-rose-300">The arena gates jammed</h2>
          <p className="mt-2 text-sm text-gray-400">Every request failed, so this battle doesn't count. Check your key/model (click the mode badge), or switch back to demo mode.</p>
          <pre className="mono mt-3 overflow-auto rounded-lg bg-ink-950 p-3 text-xs whitespace-pre-wrap text-rose-200">{battle.error}</pre>
          <button className="btn-ghost mt-4" onClick={battle.reset}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
