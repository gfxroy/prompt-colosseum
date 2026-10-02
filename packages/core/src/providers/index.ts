import type { Provider, ProviderConfig } from "../types";
import { MockProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai";
import { ReplayProvider, type Recordings } from "./replay";

export * from "./mock";
export * from "./openai";
export * from "./replay";
export * from "./features";

export interface ProviderKeys {
  openai?: string;
  gemini?: string;
  /** keyed by provider id or by baseUrl */
  compatible?: Record<string, string>;
}

export interface CreateProviderOptions {
  keys: ProviderKeys;
  /** When a real provider has no key: replay recordings (demo) or use the mock. */
  recordings?: Recordings;
  delayScale?: number;
  fetchImpl?: typeof fetch;
}

export function keyFor(cfg: ProviderConfig, keys: ProviderKeys): string | undefined {
  if (cfg.type === "openai") return keys.openai;
  if (cfg.type === "gemini") return keys.gemini;
  if (cfg.type === "openai-compatible") return keys.compatible?.[cfg.id] ?? (cfg.baseUrl ? keys.compatible?.[cfg.baseUrl] : undefined);
  return undefined;
}

/** True when this provider will call a live API (vs. mock / recorded demo). */
export function isLive(cfg: ProviderConfig, keys: ProviderKeys): boolean {
  if (cfg.type === "mock") return false;
  if (cfg.type === "openai-compatible" && cfg.baseUrl && /localhost|127\.0\.0\.1/.test(cfg.baseUrl)) return true;
  return Boolean(keyFor(cfg, keys));
}

export function createProvider(cfg: ProviderConfig, opts: CreateProviderOptions): Provider {
  if (cfg.type === "mock") return new MockProvider(cfg.id, { delayScale: opts.delayScale, model: cfg.model });
  if (isLive(cfg, opts.keys)) return new OpenAICompatibleProvider(cfg, keyFor(cfg, opts.keys) ?? "", opts.fetchImpl);
  return new ReplayProvider(cfg.id, cfg.model, opts.recordings ?? {}, opts.delayScale);
}
