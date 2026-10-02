import { createProvider, MockProvider, isLive, type Provider, type ProviderConfig, type Recordings, type Suite } from "@colosseum/core";
import recordingsJson from "../demo/recordings.json";
import type { KeyState } from "./state";

export const RECORDINGS = recordingsJson as Recordings;
export const MOCK_CONFIG: ProviderConfig = { id: "mock", type: "mock", model: "mock-1", label: "mock-1 (simulator)", temperature: 0 };

export type ProviderMode = "live" | "recorded" | "mock";

export function providerMode(cfg: ProviderConfig, k: KeyState): ProviderMode {
  if (cfg.type === "mock") return "mock";
  return isLive(cfg, k.keys) ? "live" : "recorded";
}

/** Instantiates every provider in a suite for the browser. Without a key, real models replay recordings. */
export function suiteProviders(suite: Suite, k: KeyState, delayScale = 0.25): Record<string, Provider> {
  const out: Record<string, Provider> = {};
  for (const cfg of suite.providers) out[cfg.id] = createProvider(cfg, { keys: k.keys, recordings: RECORDINGS, delayScale });
  return out;
}

/** Battle opponent model: your configured live model, or the deterministic simulator. */
export function battleProvider(k: KeyState): { cfg: ProviderConfig; provider: Provider; live: boolean } {
  if (k.active && isLive(k.active, k.keys)) {
    const cfg = { ...k.active, id: "live", temperature: 0 };
    return { cfg, provider: createProvider(cfg, { keys: k.keys }), live: true };
  }
  return { cfg: MOCK_CONFIG, provider: new MockProvider("mock", { delayScale: 0.15 }), live: false };
}

export const PRESET_MODELS: Record<"gemini" | "openai", string[]> = {
  gemini: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-flash"],
  openai: ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", "gpt-5-mini", "gpt-4.1"],
};
