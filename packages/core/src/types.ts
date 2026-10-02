/** Shared domain types for Prompt Colosseum (browser + Node). */

export type Role = "system" | "user" | "assistant";
export interface ChatMessage {
  role: Role;
  content: string;
}

/** One version of a prompt. `template` renders into the user message; `system` (optional) into the system message. */
export interface PromptVersion {
  id: string;
  label?: string;
  system?: string;
  template: string;
  notes?: string;
}

export type ProviderType = "mock" | "openai" | "gemini" | "openai-compatible";

export interface Pricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
}

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  model: string;
  label?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  pricing?: Pricing;
  /** CLI only: environment variable holding the API key (defaults: OPENAI_API_KEY / GEMINI_API_KEY / COLOSSEUM_API_KEY). */
  apiKeyEnv?: string;
}

export interface AssertionSpec {
  type: string;
  /** Invert the result (pass <-> fail). `not-contains` etc. are sugar for this. */
  not?: boolean;
  weight?: number;
  [key: string]: unknown;
}

export interface TestCase {
  id: string;
  description?: string;
  vars: Record<string, unknown>;
  assert: AssertionSpec[];
  tags?: string[];
}

export interface SuiteSettings {
  repeats?: number;
  concurrency?: number;
  /** Requests per minute per provider (client-side limiter). */
  rpm?: number;
  /** A case passes when weighted score >= threshold AND (if `requireAll`) every assertion passes. */
  threshold?: number;
  requireAll?: boolean;
}

export interface Suite {
  name: string;
  description?: string;
  prompts: PromptVersion[];
  providers: ProviderConfig[];
  tests: TestCase[];
  defaults?: { assert?: AssertionSpec[]; vars?: Record<string, unknown> };
  judge?: { provider: string; rubricPrefix?: string };
  settings?: SuiteSettings;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Completion {
  text: string;
  usage: Usage;
  latencyMs: number;
  /** Where the answer came from: a live API, a recording, or the deterministic mock. */
  source: "live" | "recorded" | "mock";
  model: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Repeat index, used by mock/replay providers to emulate sampling variance. */
  seed?: number;
  signal?: AbortSignal;
  /** Unrendered prompt + variables. Real APIs ignore this; the mock simulator uses it to tell instructions from data. */
  meta?: { system?: string; template?: string; vars?: Record<string, unknown> };
}

export interface Provider {
  id: string;
  model: string;
  complete(req: CompletionRequest): Promise<Completion>;
}

export interface Embedder {
  name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface AssertionResult {
  type: string;
  pass: boolean;
  score: number;
  reason: string;
  weight: number;
  /** Extra data for the UI (judge prompt/response, diff, matches...). */
  details?: Record<string, unknown>;
}

export interface CellResult {
  key: string;
  promptId: string;
  providerId: string;
  testId: string;
  repeat: number;
  messages: ChatMessage[];
  output: string;
  error?: string;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  source: Completion["source"] | "error";
  assertions: AssertionResult[];
  score: number;
  pass: boolean;
}

export interface RunResult {
  id: string;
  suiteName: string;
  suiteHash: string;
  startedAt: string;
  finishedAt: string;
  promptIds: string[];
  providerIds: string[];
  testIds: string[];
  repeats: number;
  cells: CellResult[];
}
