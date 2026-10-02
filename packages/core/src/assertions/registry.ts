/** Assertion catalogue: names + one-line docs + example (powers validation, the UI picker and the README). */
export interface AssertionDoc {
  type: string;
  summary: string;
  example: Record<string, unknown>;
  category: "text" | "structure" | "performance" | "semantic" | "safety";
}

export const ASSERTION_DOCS: AssertionDoc[] = [
  { type: "equals", category: "text", summary: "Output equals value (trimmed; ignore_case optional)", example: { type: "equals", value: "positive" } },
  { type: "contains", category: "text", summary: "Output contains value (case-sensitive)", example: { type: "contains", value: "refund" } },
  { type: "icontains", category: "text", summary: "Output contains value (case-insensitive)", example: { type: "icontains", value: "sorry" } },
  { type: "contains-any", category: "text", summary: "Output contains at least one of values", example: { type: "contains-any", values: ["sorry", "apologize"] } },
  { type: "contains-all", category: "text", summary: "Output contains every one of values", example: { type: "contains-all", values: ["[doc-1]", "30 days"] } },
  { type: "starts-with", category: "text", summary: "Output starts with value", example: { type: "starts-with", value: "{" } },
  { type: "regex", category: "text", summary: "Output matches a regular expression", example: { type: "regex", value: "\\d{4}-\\d{2}-\\d{2}" } },
  { type: "length", category: "text", summary: "Output length within min/max chars or words", example: { type: "length", max: 120, unit: "words" } },
  { type: "is-json", category: "structure", summary: "Output parses as JSON (allow_fences to accept ```json blocks)", example: { type: "is-json" } },
  { type: "json-schema", category: "structure", summary: "Output is JSON valid against a JSON Schema", example: { type: "json-schema", schema: { type: "object", required: ["name"] } } },
  { type: "json-path", category: "structure", summary: "Value at a JSONPath equals / contains / matches / exists", example: { type: "json-path", path: "$.total", equals: 42.5 } },
  { type: "latency", category: "performance", summary: "Response time under max_ms", example: { type: "latency", max_ms: 5000 } },
  { type: "cost", category: "performance", summary: "Estimated request cost under max_usd", example: { type: "cost", max_usd: 0.001 } },
  { type: "tokens", category: "performance", summary: "Output tokens under max", example: { type: "tokens", max: 300 } },
  { type: "similar", category: "semantic", summary: "Semantic similarity to a reference ≥ threshold (embeddings, or lexical fallback)", example: { type: "similar", value: "Your order ships in 3 days", threshold: 0.6 } },
  { type: "llm-rubric", category: "semantic", summary: "An LLM judge grades the output against a rubric (judge prompt is shown)", example: { type: "llm-rubric", value: "Acknowledges the customer's frustration and offers a next step" } },
  { type: "refusal", category: "safety", summary: "Output is a refusal (use not-refusal to catch over-refusal)", example: { type: "refusal" } },
  { type: "no-pii", category: "safety", summary: "No emails, phones, SSNs, cards, IPs, API keys… that weren't in the user's input", example: { type: "no-pii" } },
];

export const ASSERTION_TYPES = ASSERTION_DOCS.map((d) => d.type);

/** Normalises an assertion: `not-contains` -> {type: contains, not: true}; a bare string -> {type}. */
export function normalizeAssertion(raw: unknown): import("../types").AssertionSpec {
  let spec = typeof raw === "string" ? { type: raw } : { ...(raw as import("../types").AssertionSpec) };
  // map shorthand: `- icontains: sorry`  ->  { type: icontains, value: sorry }
  if (raw && typeof raw === "object" && !("type" in raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    const [head, ...rest] = entries;
    if (head) spec = { ...Object.fromEntries(rest), type: head[0], ...(head[1] !== null && head[1] !== undefined && head[1] !== true ? { value: head[1] } : {}) };
  }
  if (typeof spec.type === "string" && spec.type.startsWith("not-") && !ASSERTION_TYPES.includes(spec.type)) {
    spec.type = spec.type.slice(4);
    spec.not = !spec.not;
  }
  return spec;
}
