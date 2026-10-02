import { hashHex, stableStringify } from "../hash";
import type { ChatMessage, Completion, CompletionRequest, Provider } from "../types";
import { MockProvider } from "./mock";

export interface Recording {
  text: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}
export type Recordings = Record<string, Recording>;

export function recordingKey(model: string, messages: ChatMessage[], seed = 0): string {
  return hashHex(stableStringify({ model, messages: messages.map((m) => [m.role, m.content]), seed }));
}

/**
 * Serves real, previously recorded model answers (demo mode). Unknown prompts fall back to the
 * deterministic mock and are labelled source="mock" so the UI can say so.
 */
export class ReplayProvider implements Provider {
  private fallback: MockProvider;
  constructor(
    public id: string,
    public model: string,
    private recordings: Recordings,
    private delayScale = 0,
  ) {
    this.fallback = new MockProvider(id, { delayScale });
  }
  find(messages: ChatMessage[], seed = 0): Recording | undefined {
    return this.recordings[recordingKey(this.model, messages, seed)] ?? this.recordings[recordingKey(this.model, messages, 0)];
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    const rec = this.find(req.messages, req.seed ?? 0);
    if (!rec) return this.fallback.complete(req);
    if (this.delayScale > 0) await new Promise((r) => setTimeout(r, Math.min(4000, rec.latencyMs * this.delayScale)));
    return { text: rec.text, latencyMs: rec.latencyMs, usage: { inputTokens: rec.inputTokens, outputTokens: rec.outputTokens }, source: "recorded", model: rec.model };
  }
}

/** Wraps a provider and captures every completion into a recordings map (used by `colosseum run --record`). */
export class RecordingProvider implements Provider {
  constructor(
    private inner: Provider,
    public recordings: Recordings,
  ) {}
  get id() {
    return this.inner.id;
  }
  get model() {
    return this.inner.model;
  }
  async complete(req: CompletionRequest): Promise<Completion> {
    const res = await this.inner.complete(req);
    if (res.source === "live") {
      this.recordings[recordingKey(this.inner.model, req.messages, req.seed ?? 0)] = {
        text: res.text,
        latencyMs: Math.round(res.latencyMs),
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        model: res.model,
      };
    }
    return res;
  }
}
