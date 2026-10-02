import { updateElo } from "./elo";
import type { BattleResult } from "./battle";

export interface BattleLogEntry {
  at: string;
  bossId: string;
  mode: "campaign" | "daily" | "practice";
  verdict: BattleResult["verdict"];
  playerScore: number;
  championScore: number;
  ratingDelta: number;
  xp: number;
  live: boolean;
  promptLength: number;
  day?: string;
}

export interface Progress {
  version: 1;
  rating: number;
  peakRating: number;
  xp: number;
  wins: number;
  losses: number;
  draws: number;
  campaignCleared: string[];
  attempts: Record<string, number>;
  daily: Record<string, { verdict: BattleResult["verdict"]; score: number; emoji: string }>;
  streak: number;
  bestStreak: number;
  lastDaily: string | null;
  badges: Record<string, string>;
  votes: number;
  log: BattleLogEntry[];
}

export const newProgress = (): Progress => ({
  version: 1,
  rating: 900,
  peakRating: 900,
  xp: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  campaignCleared: [],
  attempts: {},
  daily: {},
  streak: 0,
  bestStreak: 0,
  lastDaily: null,
  badges: {},
  votes: 0,
  log: [],
});

/** Level curve: level n needs 100 * n^1.5 cumulative-ish XP. */
export function levelFor(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let floor = 0;
  for (;;) {
    const need = Math.round(100 * level ** 1.5);
    if (xp < floor + need) return { level, into: xp - floor, needed: need };
    floor += need;
    level++;
  }
}

export function xpFor(result: BattleResult, firstClear: boolean, mode: BattleLogEntry["mode"]): number {
  const passed = result.rounds.reduce((a, r) => a + r.player.assertions.filter((x) => x.pass).length, 0);
  let xp = passed * 5 + Math.round(result.playerScore * 50);
  if (result.verdict === "victory") xp += 100;
  if (result.verdict === "draw") xp += 30;
  if (firstClear) xp += 150;
  if (mode === "daily") xp = Math.round(xp * 1.5);
  if (result.live) xp = Math.round(xp * 1.25);
  return xp;
}

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const BADGES: BadgeDef[] = [
  { id: "first-blood", name: "First Blood", emoji: "🗡️", description: "Win your first battle" },
  { id: "flawless", name: "Flawless", emoji: "💯", description: "Win with every assertion passing" },
  { id: "giant-slayer", name: "Giant Slayer", emoji: "🪨", description: "Beat a boss rated 300+ above you" },
  { id: "minimalist", name: "Minimalist", emoji: "🪶", description: "Win with a prompt under 160 characters" },
  { id: "json-whisperer", name: "JSON Whisperer", emoji: "🧱", description: "Defeat Jason and the Null Hydra" },
  { id: "iron-vault", name: "Iron Vault", emoji: "🔐", description: "Defeat Silver Tongue the Jailbreaker" },
  { id: "privacy-paladin", name: "Privacy Paladin", emoji: "🕵️", description: "Defeat the Data Broker" },
  { id: "calibrated", name: "Calibrated", emoji: "⚖️", description: "Defeat the Paranoid Sentinel" },
  { id: "emperor-slayer", name: "Emperor Slayer", emoji: "👑", description: "Clear the entire campaign" },
  { id: "daily-3", name: "On Fire", emoji: "🔥", description: "3-day Daily Duel streak" },
  { id: "daily-7", name: "Unstoppable", emoji: "☄️", description: "7-day Daily Duel streak" },
  { id: "real-deal", name: "Real Deal", emoji: "⚡", description: "Win a battle against a real model with your own key" },
  { id: "judge", name: "People's Judge", emoji: "🗳️", description: "Cast 20 blind votes" },
  { id: "comeback", name: "Comeback Kid", emoji: "🔄", description: "Win after 3+ losses to the same boss" },
  { id: "gold", name: "Gold Gladiator", emoji: "🥇", description: "Reach Gold rank (1200)" },
];

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface ApplyOutcome {
  progress: Progress;
  xp: number;
  ratingDelta: number;
  newBadges: BadgeDef[];
  firstClear: boolean;
  leveledUp: boolean;
}

/** Pure reducer: applies a battle result to the player's progress. */
export function applyBattle(
  prev: Progress,
  result: BattleResult,
  ctx: { bossId: string; bossRating: number; mode: BattleLogEntry["mode"]; promptLength: number; day?: string; emoji?: string; now?: Date; campaignIds?: string[] },
): ApplyOutcome {
  const p: Progress = structuredClone(prev);
  const now = ctx.now ?? new Date();
  const priorAttempts = p.attempts[ctx.bossId] ?? 0;
  const priorLosses = p.log.filter((l) => l.bossId === ctx.bossId && l.verdict === "defeat").length;
  p.attempts[ctx.bossId] = priorAttempts + 1;
  const firstClear = result.verdict === "victory" && ctx.mode === "campaign" && !p.campaignCleared.includes(ctx.bossId);
  const s = result.verdict === "victory" ? 1 : result.verdict === "draw" ? 0.5 : 0;
  const [nr] = updateElo(p.rating, ctx.bossRating, s, ctx.mode === "practice" ? 16 : 32);
  const ratingDelta = nr - p.rating;
  p.rating = nr;
  p.peakRating = Math.max(p.peakRating, nr);
  if (result.verdict === "victory") p.wins++;
  else if (result.verdict === "defeat") p.losses++;
  else p.draws++;
  if (firstClear) p.campaignCleared.push(ctx.bossId);
  if (ctx.mode === "daily" && ctx.day && !p.daily[ctx.day]) {
    p.daily[ctx.day] = { verdict: result.verdict, score: result.playerScore, emoji: ctx.emoji ?? "" };
    p.streak = p.lastDaily && dayDiff(p.lastDaily, ctx.day) === 1 ? p.streak + 1 : p.lastDaily === ctx.day ? p.streak : 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.lastDaily = ctx.day;
  }
  const xp = xpFor(result, firstClear, ctx.mode);
  const beforeLevel = levelFor(p.xp).level;
  p.xp += xp;
  p.log = [
    { at: now.toISOString(), bossId: ctx.bossId, mode: ctx.mode, verdict: result.verdict, playerScore: result.playerScore, championScore: result.championScore, ratingDelta, xp, live: result.live, promptLength: ctx.promptLength, day: ctx.day },
    ...p.log,
  ].slice(0, 200);

  const earned: string[] = [];
  const win = result.verdict === "victory";
  const award = (id: string, cond: boolean) => cond && !p.badges[id] && (p.badges[id] = now.toISOString()) && earned.push(id);
  award("first-blood", win);
  award("flawless", win && result.playerScore === 1);
  award("giant-slayer", win && ctx.bossRating - prev.rating >= 300);
  award("minimalist", win && ctx.promptLength < 160);
  award("json-whisperer", p.campaignCleared.includes("jason") && p.campaignCleared.includes("null-hydra"));
  award("iron-vault", p.campaignCleared.includes("silver-tongue"));
  award("privacy-paladin", p.campaignCleared.includes("data-broker"));
  award("calibrated", p.campaignCleared.includes("sentinel"));
  award("emperor-slayer", Boolean(ctx.campaignIds?.length) && ctx.campaignIds!.every((id) => p.campaignCleared.includes(id)));
  award("daily-3", p.streak >= 3);
  award("daily-7", p.streak >= 7);
  award("real-deal", win && result.live);
  award("comeback", win && priorLosses >= 3);
  award("gold", p.rating >= 1200);
  return { progress: p, xp, ratingDelta, newBadges: BADGES.filter((b) => earned.includes(b.id)), firstClear, leveledUp: levelFor(p.xp).level > beforeLevel };
}

export function applyVote(prev: Progress, now = new Date()): { progress: Progress; newBadges: BadgeDef[] } {
  const p = structuredClone(prev);
  p.votes++;
  p.xp += 5;
  const newBadges: BadgeDef[] = [];
  if (p.votes >= 20 && !p.badges.judge) {
    p.badges.judge = now.toISOString();
    newBadges.push(BADGES.find((b) => b.id === "judge")!);
  }
  return { progress: p, newBadges };
}
