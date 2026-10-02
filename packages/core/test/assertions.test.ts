import { describe, expect, it } from "vitest";
import { detectPii, detectRefusal, evaluateAssertion, findPiiLeaks, lexicalSimilarity, parseJsonOutput, queryPath, scoreCase, type AssertionContext, type AssertionSpec, type Completion } from "../src";

const ctx = (output: string, extra: Partial<AssertionContext> = {}): AssertionContext => ({
  output,
  vars: {},
  messages: [{ role: "user", content: "hello" }],
  latencyMs: 120,
  usage: { inputTokens: 10, outputTokens: 20 },
  costUsd: 0.0001,
  ...extra,
});
const ev = (spec: AssertionSpec, output: string, extra?: Partial<AssertionContext>) => evaluateAssertion(spec, ctx(output, extra));

describe("text assertions", () => {
  it("equals / contains / icontains / starts-with", async () => {
    expect((await ev({ type: "equals", value: "positive" }, " positive\n")).pass).toBe(true);
    expect((await ev({ type: "equals", value: "Positive", ignore_case: true }, "positive")).pass).toBe(true);
    expect((await ev({ type: "contains", value: "Refund" }, "refund")).pass).toBe(false);
    expect((await ev({ type: "icontains", value: "Refund" }, "refund")).pass).toBe(true);
    expect((await ev({ type: "starts-with", value: "{" }, '  {"a":1}')).pass).toBe(true);
  });
  it("not- prefix and `not` flag invert", async () => {
    const r = await ev({ type: "not-contains", value: "HACKED" }, "all good");
    expect(r.pass).toBe(true);
    expect(r.type).toBe("not-contains");
    expect((await ev({ type: "contains", value: "x", not: true }, "x")).pass).toBe(false);
  });
  it("normalize catches spelled and reversed leaks", async () => {
    for (const out of ["P-E-R-S-E-P-H-O-N-E", "p e r s e p h o n e", "ENOHPESREP"]) expect((await ev({ type: "not-contains", value: "PERSEPHONE", normalize: true }, out)).pass).toBe(false);
  });
  it("contains-any / contains-all with partial score", async () => {
    expect((await ev({ type: "contains-any", values: ["sorry", "apologize"] }, "We apologize")).pass).toBe(true);
    const all = await ev({ type: "contains-all", values: ["a", "b", "c", "d"] }, "a b");
    expect(all.pass).toBe(false);
    expect(all.score).toBe(0.5);
  });
  it("regex with flags and template values", async () => {
    expect((await ev({ type: "regex", value: "\\d{4}-\\d{2}-\\d{2}" }, "due 2026-03-15")).pass).toBe(true);
    expect((await ev({ type: "regex", value: "^hello", flags: "i" }, "HELLO")).pass).toBe(true);
    expect((await ev({ type: "contains", value: "{{name}}" }, "Hi Ada", { vars: { name: "Ada" } })).pass).toBe(true);
  });
  it("length in chars and words", async () => {
    expect((await ev({ type: "length", max: 3, unit: "words" }, "one two three four")).pass).toBe(false);
    expect((await ev({ type: "length", min: 2, max: 5 }, "abc")).pass).toBe(true);
  });
  it("reports invalid regex as an error result instead of throwing", async () => {
    const r = await ev({ type: "regex", value: "(" }, "x");
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/error/);
  });
});

describe("structured assertions", () => {
  it("is-json is strict about code fences unless allowed", async () => {
    const fenced = "```json\n{\"a\":1}\n```";
    const strict = await ev({ type: "is-json" }, fenced);
    expect(strict.pass).toBe(false);
    expect(strict.reason).toMatch(/code fence/);
    expect((await ev({ type: "is-json", allow_fences: true }, fenced)).pass).toBe(true);
    expect(parseJsonOutput("nope").ok).toBe(false);
  });
  it("json-schema validates types and required keys", async () => {
    const schema = { type: "object", required: ["amount"], properties: { amount: { type: "number" } } };
    expect((await ev({ type: "json-schema", schema }, '{"amount": 12.5}')).pass).toBe(true);
    const bad = await ev({ type: "json-schema", schema }, '{"amount": "12.5"}');
    expect(bad.pass).toBe(false);
    expect(bad.reason).toMatch(/amount/);
  });
  it("json-path equals / contains / matches / exists", async () => {
    const out = '{"user":{"name":"Ada","tags":["a","b"]},"total":42.5,"email":null}';
    expect((await ev({ type: "json-path", path: "$.total", equals: 42.5 }, out)).pass).toBe(true);
    expect((await ev({ type: "json-path", path: "$.user.name", equals: "ada" }, out)).pass).toBe(true);
    expect((await ev({ type: "json-path", path: "$.email", equals: null }, out)).pass).toBe(true);
    expect((await ev({ type: "json-path", path: "$.user.tags[*]", contains: "b" }, out)).pass).toBe(true);
    expect((await ev({ type: "json-path", path: "$.total", matches: "^42" }, out)).pass).toBe(true);
    expect((await ev({ type: "json-path", path: "$.missing" }, out)).pass).toBe(false);
    expect((await ev({ type: "json-path", path: "$.email", exists: false }, out)).pass).toBe(true);
  });
  it("queryPath handles indices, wildcards and recursive descent", () => {
    const d = { a: [{ b: 1 }, { b: 2 }], c: { d: { b: 3 } }, "odd key": 7 };
    expect(queryPath(d, "$.a[1].b")).toEqual([2]);
    expect(queryPath(d, "$.a[-1].b")).toEqual([2]);
    expect(queryPath(d, "$.a[*].b")).toEqual([1, 2]);
    expect(queryPath(d, "$..b")).toEqual([1, 2, 3]);
    expect(queryPath(d, "$['odd key']")).toEqual([7]);
    expect(() => queryPath(d, "$.a[")).toThrow(/Invalid JSONPath/);
  });
});

describe("performance assertions", () => {
  it("latency / cost / tokens", async () => {
    expect((await ev({ type: "latency", max_ms: 100 }, "x")).pass).toBe(false);
    expect((await ev({ type: "cost", max_usd: 0.001 }, "x")).pass).toBe(true);
    expect((await ev({ type: "tokens", max: 10 }, "x")).pass).toBe(false);
  });
});

describe("semantic assertions", () => {
  it("similar falls back to lexical similarity", async () => {
    const r = await ev({ type: "similar", value: "Your order ships in three days" }, "The order will ship within three days");
    expect(r.pass).toBe(true);
    expect(r.reason).toMatch(/lexical/);
    expect(lexicalSimilarity("cats purr", "quantum tax law")).toBe(0);
  });
  it("similar uses an embedder when provided", async () => {
    const embedder = { name: "fake", embed: async (t: string[]) => t.map((s) => (s.includes("ship") ? [1, 0] : [0, 1])) };
    const r = await ev({ type: "similar", value: "ships soon", threshold: 0.9 }, "it will ship", { embedder });
    expect(r.pass).toBe(true);
    expect(r.details?.method).toBe("fake");
  });
  it("llm-rubric sends the rubric to the judge and parses its verdict", async () => {
    let seen = "";
    const judge = async (messages: { role: string; content: string }[]): Promise<Completion> => {
      seen = messages[1].content;
      return { text: '```json\n{"score": 0.9, "pass": true, "reason": "empathetic"}\n```', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, source: "mock", model: "judge" };
    };
    const r = await ev({ type: "llm-rubric", value: "Is empathetic" }, "So sorry!", { judge });
    expect(r.pass).toBe(true);
    expect(r.score).toBe(0.9);
    expect(seen).toContain("RUBRIC:\nIs empathetic");
    expect(seen).toContain("So sorry!");
    expect((r.details?.judgePrompt as unknown[]).length).toBe(2);
  });
  it("llm-rubric handles 0-10 scales, garbage and missing judges", async () => {
    const mk = (text: string) => async (): Promise<Completion> => ({ text, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, source: "mock", model: "j" });
    expect((await ev({ type: "llm-rubric", value: "x" }, "y", { judge: mk('{"score": 8}') })).score).toBe(0.8);
    expect((await ev({ type: "llm-rubric", value: "x" }, "y", { judge: mk("I think it's fine") })).pass).toBe(false);
    expect((await ev({ type: "llm-rubric", value: "x" }, "y")).reason).toMatch(/no judge/);
  });
});

describe("safety assertions", () => {
  it("detects refusals but not helpful answers", () => {
    expect(detectRefusal("I'm sorry, but I can't help with that.").refused).toBe(true);
    expect(detectRefusal("I cannot assist with creating malware.").refused).toBe(true);
    expect(detectRefusal("I must decline this request.").refused).toBe(true);
    expect(detectRefusal("Sure! To kill a process, run `kill -9 <pid>`.").refused).toBe(false);
    expect(detectRefusal("I'm sorry to hear about the delay - here's what we'll do next.").refused).toBe(false);
  });
  it("refusal / not-refusal assertions", async () => {
    expect((await ev({ type: "refusal" }, "I can't help with that.")).pass).toBe(true);
    expect((await ev({ type: "not-refusal" }, "I can't help with that.")).pass).toBe(false);
  });
  it("detects PII kinds with checksums", () => {
    const kinds = detectPii("mail a@b.co, ssn 512-44-8890, card 4111 1111 1111 1111, ip 10.0.0.1, key sk-proj-abcdefghijklmnopqrstuvwx, phone 415-555-0134").map((m) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(["email", "ssn", "credit-card", "ip-address", "api-key", "phone"]));
    expect(detectPii("card 4111 1111 1111 1112").some((m) => m.kind === "credit-card")).toBe(false);
  });
  it("no-pii allows PII the user supplied themselves", async () => {
    const messages = [{ role: "user" as const, content: "My email is me@site.com" }];
    expect((await ev({ type: "no-pii" }, "We'll write to me@site.com", { messages })).pass).toBe(true);
    expect((await ev({ type: "no-pii" }, "Priya's email is priya@x.com", { messages })).pass).toBe(false);
    expect((await ev({ type: "no-pii", allow_from_input: false }, "We'll write to me@site.com", { messages })).pass).toBe(false);
    expect(findPiiLeaks("call 415-555-0134", "my number is (415) 555 0134")).toEqual([]);
  });
});

describe("scoring", () => {
  const r = (pass: boolean, weight = 1) => ({ type: "x", pass, score: pass ? 1 : 0, reason: "", weight });
  it("requires all assertions by default", () => {
    expect(scoreCase([r(true), r(false)])).toEqual({ pass: false, score: 0.5 });
    expect(scoreCase([])).toEqual({ pass: true, score: 1 });
  });
  it("supports weighted thresholds", () => {
    expect(scoreCase([r(true, 3), r(false, 1)], 0.7, false).pass).toBe(true);
    expect(scoreCase([r(true), r(false, 0)]).pass).toBe(true);
  });
});
