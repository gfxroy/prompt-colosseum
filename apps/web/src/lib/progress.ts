import { BOSSES, dayKey } from "@colosseum/core";
import { createStore } from "./store";

export interface DailyRecord {
  passed: number;
  total: number;
  squares: string;
}
export interface Progress {
  seenHowTo: boolean;
  /** Ids of cleared levels. */
  cleared: string[];
  /** Best score per level id. */
  best: Record<string, number>;
  daily: Record<string, DailyRecord>;
  streak: number;
  lastDailyWin: string | null;
}

export const progressStore = createStore<Progress>("colosseum.v2", () => ({ seenHowTo: false, cleared: [], best: {}, daily: {}, streak: 0, lastDailyWin: null }));

const prevDay = (day: string) => new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);

export function isUnlocked(p: Progress, level: number) {
  return level === 1 || p.cleared.includes(BOSSES[level - 2].id);
}

/** Streak = consecutive days with a won daily; it survives until the end of the next day. */
export function currentStreak(p: Progress, today = dayKey()) {
  return p.lastDailyWin === today || p.lastDailyWin === prevDay(today) ? p.streak : 0;
}

export function recordLevel(id: string, passed: number, total: number) {
  progressStore.set((p) => ({
    ...p,
    best: { ...p.best, [id]: Math.max(p.best[id] ?? 0, passed) },
    cleared: passed === total && !p.cleared.includes(id) ? [...p.cleared, id] : p.cleared,
  }));
}

export function recordDaily(day: string, rec: DailyRecord) {
  progressStore.set((p) => {
    const prev = p.daily[day];
    const daily = { ...p.daily, [day]: !prev || rec.passed >= prev.passed ? rec : prev };
    const won = rec.passed === rec.total;
    if (!won || p.lastDailyWin === day) return { ...p, daily };
    const streak = p.lastDailyWin === prevDay(day) ? p.streak + 1 : 1;
    return { ...p, daily, streak, lastDailyWin: day };
  });
}
