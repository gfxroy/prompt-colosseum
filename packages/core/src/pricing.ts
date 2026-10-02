import type { Pricing, ProviderConfig, Usage } from "./types";

/**
 * Indicative list prices (USD per 1M tokens). Prices change often - override per provider with `pricing:`.
 * Matching is by longest model-name prefix.
 */
export const PRICING: Record<string, Pricing> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3": { input: 0.5, output: 3 },
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "mock-1": { input: 0, output: 0 },
};

export function pricingFor(cfg: Pick<ProviderConfig, "model" | "pricing">): Pricing | null {
  if (cfg.pricing) return cfg.pricing;
  const keys = Object.keys(PRICING)
    .filter((k) => cfg.model === k || cfg.model.startsWith(k + "-") || cfg.model.startsWith(k))
    .sort((a, b) => b.length - a.length);
  return keys.length ? PRICING[keys[0]] : null;
}

export function costOf(usage: Usage, pricing: Pricing | null): number {
  if (!pricing) return 0;
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
}
