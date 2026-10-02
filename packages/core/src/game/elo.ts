/** Elo + rank tiers for players, and a pairwise Elo leaderboard for the blind A/B arena. */
export const expected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));

export function updateElo(ra: number, rb: number, scoreA: number, k = 32): [number, number] {
  const ea = expected(ra, rb);
  const na = ra + k * (scoreA - ea);
  const nb = rb + k * (1 - scoreA - (1 - ea));
  return [Math.round(na), Math.round(nb)];
}

export interface Tier {
  name: string;
  min: number;
  color: string;
  emoji: string;
}

export const TIERS: Tier[] = [
  { name: "Bronze", min: 0, color: "#cd7f32", emoji: "🥉" },
  { name: "Silver", min: 1000, color: "#c0c7d1", emoji: "🥈" },
  { name: "Gold", min: 1200, color: "#f5c542", emoji: "🥇" },
  { name: "Platinum", min: 1400, color: "#7fe0d6", emoji: "💠" },
  { name: "Diamond", min: 1600, color: "#7cb7ff", emoji: "💎" },
  { name: "Master", min: 1800, color: "#c084fc", emoji: "🔱" },
  { name: "Legend", min: 2000, color: "#ff6b6b", emoji: "👑" },
];

export function tierFor(rating: number): Tier & { division: string; next: Tier | null; progress: number } {
  let idx = 0;
  TIERS.forEach((t, i) => rating >= t.min && (idx = i));
  const t = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  const span = next ? next.min - t.min : 400;
  const into = Math.max(0, rating - t.min);
  const division = next ? ["III", "II", "I"][Math.min(2, Math.floor((into / span) * 3))] : "";
  return { ...t, division, next, progress: next ? Math.min(1, into / span) : 1 };
}

export interface LeaderboardEntry {
  id: string;
  label: string;
  rating: number;
  wins: number;
  losses: number;
  ties: number;
}

export function recordVote(board: Record<string, LeaderboardEntry>, a: { id: string; label: string }, b: { id: string; label: string }, outcome: "a" | "b" | "tie"): Record<string, LeaderboardEntry> {
  const next = { ...board };
  const get = (x: { id: string; label: string }) => (next[x.id] = { ...(next[x.id] ?? { id: x.id, label: x.label, rating: 1000, wins: 0, losses: 0, ties: 0 }) });
  const ea = get(a);
  const eb = get(b);
  const s = outcome === "a" ? 1 : outcome === "b" ? 0 : 0.5;
  [ea.rating, eb.rating] = updateElo(ea.rating, eb.rating, s, 24);
  if (outcome === "a") {
    ea.wins++;
    eb.losses++;
  } else if (outcome === "b") {
    eb.wins++;
    ea.losses++;
  } else {
    ea.ties++;
    eb.ties++;
  }
  return next;
}
