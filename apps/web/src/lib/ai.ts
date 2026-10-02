import { createProvider, isLive, MockProvider, type Provider, type ProviderConfig, type ProviderKeys } from "@colosseum/core";
import { createStore } from "./store";

/** Your key lives in sessionStorage only: gone when the tab closes, sent nowhere but the provider. */
export interface KeyState {
  keys: ProviderKeys;
  active: ProviderConfig | null;
}
export const keyStore = createStore<KeyState>("colosseum.key", () => ({ keys: {}, active: null }), "session");

export const MODELS = { gemini: "gemini-3.5-flash-lite", openai: "gpt-4.1-mini" } as const;

export const isRealAI = (k: KeyState) => Boolean(k.active && isLive(k.active, k.keys));

export function aiFor(k: KeyState): { cfg: ProviderConfig; provider: Provider; live: boolean } {
  if (k.active && isLive(k.active, k.keys)) {
    const cfg = { ...k.active, id: "live", temperature: 0 };
    return { cfg, provider: createProvider(cfg, { keys: k.keys }), live: true };
  }
  const cfg: ProviderConfig = { id: "mock", type: "mock", model: "mock-1", temperature: 0 };
  return { cfg, provider: new MockProvider("mock", { delayScale: 0.1 }), live: false };
}
