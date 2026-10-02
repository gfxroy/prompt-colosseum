import type { Completion, CompletionRequest, Provider, ProviderConfig } from "../types";
import { estimateTokens } from "./mock";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status === 408 || this.status >= 500;
  }
}

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(h);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Redacts anything that looks like a key from error text before it can reach logs/UI. */
export function redact(text: string): string {
  return text.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…").replace(/(AIza[0-9A-Za-z_-]{4})[0-9A-Za-z_-]+/g, "$1…").replace(/(Bearer\s+)\S+/gi, "$1…");
}

/**
 * Chat Completions over fetch. Works for OpenAI, Gemini (OpenAI-compatible endpoint) and any
 * OpenAI-compatible server (OpenRouter, Groq, Together, Ollama, vLLM...). Runs in browsers and Node 18+.
 */
export class OpenAICompatibleProvider implements Provider {
  id: string;
  model: string;
  private baseUrl: string;
  constructor(
    private cfg: ProviderConfig,
    private apiKey: string,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    this.id = cfg.id;
    this.model = cfg.model;
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URLS[cfg.type] ?? DEFAULT_BASE_URLS.openai).replace(/\/$/, "");
  }

  async complete(req: CompletionRequest): Promise<Completion> {
    const isOpenAI = this.cfg.type === "openai";
    const body: Record<string, unknown> = { model: this.cfg.model, messages: req.messages };
    const temperature = req.temperature ?? this.cfg.temperature;
    if (temperature !== undefined) body.temperature = temperature;
    const maxTokens = req.maxTokens ?? this.cfg.maxTokens;
    if (maxTokens) body[isOpenAI ? "max_completion_tokens" : "max_tokens"] = maxTokens;
    if (req.jsonMode ?? this.cfg.jsonMode) body.response_format = { type: "json_object" };
    const started = performance.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new HttpError(`network error calling ${this.cfg.type}: ${redact((e as Error).message)}`, 0);
    }
    if (!res.ok) {
      const text = redact(await res.text().catch(() => ""));
      throw new HttpError(`${this.cfg.type} API error ${res.status}: ${text.slice(0, 240)}`, res.status, parseRetryAfter(res));
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const latencyMs = performance.now() - started;
    const msg = data.choices?.[0]?.message;
    const text = msg?.content ?? msg?.refusal ?? "";
    const input = req.messages.map((m) => m.content).join("\n");
    return {
      text,
      usage: { inputTokens: data.usage?.prompt_tokens ?? estimateTokens(input), outputTokens: data.usage?.completion_tokens ?? estimateTokens(text) },
      latencyMs,
      source: "live",
      model: data.model ?? this.cfg.model,
    };
  }
}
