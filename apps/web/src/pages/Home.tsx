import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, FlaskConical, Map, Swords, Vote as VoteIcon } from "lucide-react";
import { BOSSES, dailyBoss, dayKey, levelFor } from "@colosseum/core";
import { progressStore } from "../lib/state";
import RankBadge from "../components/RankBadge";
import { useEffect, useState } from "react";

function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((next.getTime() - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const p = progressStore.use();
  const day = dayKey();
  const daily = dailyBoss(day);
  const played = p.daily[day];
  const countdown = useCountdown();
  const lvl = levelFor(p.xp);
  const nextBoss = BOSSES.find((b) => !p.campaignCleared.includes(b.id)) ?? BOSSES[BOSSES.length - 1];
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-ink-800 via-ink-850 to-[#1d1418] p-8 md:p-12">
        <div className="pointer-events-none absolute -right-10 -bottom-10 text-[220px] leading-none opacity-[0.07] select-none">🏛️</div>
        <div className="relative max-w-3xl">
          <span className="chip mb-4 border-gold-400/30 text-gold-300">⚔️ Unit tests for prompts - as a gladiator arena</span>
          <h1 className="text-4xl leading-[1.05] font-black tracking-tight text-white md:text-6xl">
            Write a prompt.
            <br />
            <span className="gold-text">Beat the champion.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-gray-400 md:text-lg">
            Every boss guards a hidden test suite - JSON contracts, tone rubrics, jailbreaks, grounding, PII. Your prompt and the champion's run case by case; assertions land like blows. Under the hood
            it's a real eval engine with a <b className="text-gray-200">workbench</b>, <b className="text-gray-200">CLI</b> and <b className="text-gray-200">GitHub Action</b>.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/daily" className="btn-gold animate-glow px-6 py-3 text-base" data-testid="cta-daily">
              <Swords size={18} /> {played ? "Replay today's duel" : "Fight today's Daily Duel"}
            </Link>
            <Link to="/campaign" className="btn-ghost px-5 py-3 text-base">
              <Map size={18} /> Campaign
            </Link>
            <Link to="/workbench" className="btn-ghost px-5 py-3 text-base">
              <FlaskConical size={18} /> Pro mode: Workbench
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">No sign-up, no key needed: demo mode uses a deterministic simulator + real recorded responses. Add your OpenAI/Gemini key to fight real models.</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5">
          <div className="label">Your gladiator</div>
          <RankBadge rating={p.rating} size="lg" />
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Level {lvl.level}</span>
              <span>
                {lvl.into}/{lvl.needed} XP
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-950">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-ember-500" style={{ width: `${(lvl.into / lvl.needed) * 100}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              ["Wins", p.wins],
              ["Losses", p.losses],
              ["Streak", `🔥${p.streak}`],
              ["Badges", Object.keys(p.badges).length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/5 py-2">
                <div className="text-lg font-extrabold text-white">{v}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">{k}</div>
              </div>
            ))}
          </div>
        </div>

        <Link to="/daily" className="card group relative overflow-hidden p-5 transition hover:border-gold-400/40" data-testid="daily-card">
          <div className="flex items-center justify-between">
            <div className="label flex items-center gap-1.5">
              <CalendarDays size={13} /> Daily Duel #{daily.duel}
            </div>
            <span className="chip font-mono">next in {countdown}</span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="animate-bob text-5xl">{daily.emoji}</div>
            <div>
              <div className="text-lg font-extrabold text-white">{daily.name}</div>
              <div className="text-sm text-gray-400">{daily.twist}</div>
              <div className="mt-1 text-xs text-gray-500">
                Elo {daily.rating} · {daily.cases.length} hidden cases · same for everyone today
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            {played ? (
              <span className="text-sm">
                Today: <b className={played.verdict === "victory" ? "text-emerald-400" : played.verdict === "draw" ? "text-amber-300" : "text-rose-400"}>{played.verdict.toUpperCase()}</b> {played.emoji}
              </span>
            ) : (
              <span className="text-sm text-gold-300">Keep your streak alive 🔥</span>
            )}
            <ArrowRight className="text-gray-500 transition group-hover:translate-x-1 group-hover:text-gold-300" size={18} />
          </div>
        </Link>

        <Link to={`/battle/${nextBoss.id}`} className="card group p-5 transition hover:border-gold-400/40">
          <div className="label flex items-center gap-1.5">
            <Map size={13} /> Campaign · {p.campaignCleared.length}/{BOSSES.length} cleared
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-950">
            <div className="h-full bg-gradient-to-r from-gold-400 to-ember-500" style={{ width: `${(p.campaignCleared.length / BOSSES.length) * 100}%` }} />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="text-5xl">{nextBoss.emoji}</div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">Next: level {nextBoss.level}</div>
              <div className="text-lg font-extrabold text-white">{nextBoss.name}</div>
              <div className="text-sm text-gray-400">{nextBoss.title}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-400 italic">“{nextBoss.taunt}”</p>
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Link to="/vote" className="card group flex items-start gap-4 p-5 transition hover:border-gold-400/40">
          <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-300">
            <VoteIcon />
          </div>
          <div>
            <div className="font-bold text-white">Blind Vote · A/B arena</div>
            <p className="mt-1 text-sm text-gray-400">Two anonymous outputs, one question: which is better? Your votes build a personal Elo leaderboard of models and prompt versions - and show how often you agree with the automated tests.</p>
          </div>
        </Link>
        <Link to="/workbench" className="card group flex items-start gap-4 p-5 transition hover:border-gold-400/40">
          <div className="rounded-2xl bg-sky-500/10 p-3 text-sky-300">
            <FlaskConical />
          </div>
          <div>
            <div className="font-bold text-white">Workbench · pro mode</div>
            <p className="mt-1 text-sm text-gray-400">Suites × prompt versions × models. 18 assertion types, LLM-as-judge with visible judge prompts, pass/fail heatmaps, regression & flakiness detection, YAML import/export, share links - same engine as the CLI.</p>
          </div>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "Read the brief", "Each boss has a task and a hidden test suite. You see one example and the champion's prompt."],
          ["2", "Write your prompt", "Same model, same cases. Only the prompt differs. Every assertion that fails costs HP."],
          ["3", "Climb & share", "Win Elo and XP, unlock badges, keep your daily streak, and share a Wordle-style card."],
        ].map(([n, t, d]) => (
          <div key={n} className="card p-5">
            <div className="gold-text text-3xl font-black">{n}</div>
            <div className="mt-1 font-bold text-white">{t}</div>
            <p className="mt-1 text-sm text-gray-400">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
