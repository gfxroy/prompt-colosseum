import { useState, type ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";
import { clsx } from "clsx";
import { FlaskConical, Github, Swords, Trophy, Vote as VoteIcon, Volume2, VolumeX, Zap, Map, CalendarDays } from "lucide-react";
import { levelFor } from "@colosseum/core";
import { isLiveMode, keyStore, progressStore, settingsStore } from "../lib/state";
import RankBadge from "./RankBadge";
import KeyDialog from "./KeyDialog";
import Toasts from "./Toasts";

const NAV = [
  { to: "/", label: "Arena", icon: Swords, end: true },
  { to: "/daily", label: "Daily Duel", icon: CalendarDays },
  { to: "/campaign", label: "Campaign", icon: Map },
  { to: "/vote", label: "Blind Vote", icon: VoteIcon },
  { to: "/profile", label: "Profile", icon: Trophy },
  { to: "/workbench", label: "Workbench", icon: FlaskConical },
];

export default function Layout({ children }: { children: ReactNode }) {
  const p = progressStore.use();
  const s = settingsStore.use();
  const k = keyStore.use();
  const [keysOpen, setKeysOpen] = useState(false);
  const lvl = levelFor(p.xp);
  const live = isLiveMode(k);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-900/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 pr-2">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            <span className="hidden text-[15px] font-extrabold tracking-tight text-white sm:block">
              Prompt <span className="gold-text">Colosseum</span>
            </span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition", isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200")
                }
              >
                <Icon size={15} />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {p.streak > 0 && (
              <span className="chip border-orange-400/40 text-orange-300" title="Daily Duel streak">
                🔥 {p.streak}
              </span>
            )}
            <div className="ml-3 hidden w-28 2xl:block" title={`Level ${lvl.level} · ${lvl.into}/${lvl.needed} XP`}>
              <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                <span>Lv {lvl.level}</span>
                <span>{p.xp} XP</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-950">
                <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-ember-500 transition-all duration-700" style={{ width: `${(lvl.into / lvl.needed) * 100}%` }} />
              </div>
            </div>
            <span className="hidden sm:inline">
              <RankBadge rating={p.rating} />
            </span>
            <button
              onClick={() => setKeysOpen(true)}
              data-testid="mode-badge"
              className={clsx("chip cursor-pointer", live ? "border-emerald-400/50 text-emerald-300" : "border-gold-400/40 text-gold-300")}
              title={live ? `Live: ${k.active?.model}` : "Demo mode - click to add your own key"}
            >
              <Zap size={12} /> {live ? `LIVE · ${k.active?.model}` : "DEMO · add key"}
            </button>
            <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" onClick={() => settingsStore.set((x) => ({ ...x, sound: !x.sound }))} aria-label={s.sound ? "Mute sound" : "Enable sound"} title={s.sound ? "Sound on" : "Sound off"}>
              {s.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-500">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>Prompt Colosseum · unit tests for prompts, disguised as a game</span>
          <a className="inline-flex items-center gap-1 hover:text-gray-300" href="https://github.com/gfxroy/prompt-colosseum" target="_blank" rel="noreferrer">
            <Github size={13} /> source · CLI · GitHub Action
          </a>
          <span>No backend · keys stay in your tab</span>
        </div>
      </footer>
      <KeyDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
      <Toasts />
    </div>
  );
}
