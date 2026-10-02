import { newProgress, type LeaderboardEntry, type Progress, type ProviderConfig, type ProviderKeys, type RunResult } from "@colosseum/core";
import { createStore } from "./store";

export const progressStore = createStore<Progress>("colosseum.progress.v1", newProgress);

export interface Settings {
  sound: boolean;
  speed: 1 | 2 | 4;
  reducedFx: boolean;
  onboarded: boolean;
}
export const settingsStore = createStore<Settings>("colosseum.settings.v1", () => ({ sound: false, speed: 1, reducedFx: false, onboarded: false }));

/** BYO keys live in sessionStorage only: they vanish when the tab closes and are never sent anywhere but the provider. */
export interface KeyState {
  keys: ProviderKeys;
  /** The model used for live battles / votes. */
  active: ProviderConfig | null;
  compatibleBaseUrl?: string;
}
export const keyStore = createStore<KeyState>("colosseum.keys", () => ({ keys: {}, active: null }), "session");

export const leaderboardStore = createStore<{ board: Record<string, LeaderboardEntry>; agreed: number; votes: number }>("colosseum.leaderboard.v1", () => ({ board: {}, agreed: 0, votes: 0 }));

export interface SavedSuite {
  id: string;
  yaml: string;
  updatedAt: string;
}
export const suitesStore = createStore<{ suites: SavedSuite[] }>("colosseum.suites.v1", () => ({ suites: [] }));

export interface SavedRun {
  run: RunResult;
  suiteId: string;
  label: string;
}
export const runsStore = createStore<{ runs: SavedRun[] }>("colosseum.runs.v1", () => ({ runs: [] }));

export function saveRun(r: SavedRun) {
  runsStore.set((s) => ({ runs: [r, ...s.runs.filter((x) => x.run.id !== r.run.id)].slice(0, 12) }));
}

export const isLiveMode = (k: KeyState) => Boolean(k.active && (k.keys.gemini || k.keys.openai || Object.values(k.keys.compatible ?? {}).some(Boolean)));
