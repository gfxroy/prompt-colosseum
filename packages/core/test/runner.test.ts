import { describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  compareColumns,
  completeWithRetry,
  estimateRun,
  findFlaky,
  HttpError,
  MockProvider,
  OpenAICompatibleProvider,
  planRun,
  RateLimiter,
  runSuite,
  summarizeRun,
  toJUnit,
  toMarkdown,
  type Completion,
  type Provider,
  type RunResult,
  type Suite,
} from "../src";

const suite: Suite = {
  name: "Sentiment",
  prompts: [
    { id: "v1", template: "Classify the sentiment of this review as positive, negative or neutral. Respond with only the label.\n{{review}}" },
    { id: "v2", template: "Classify the sentiment of this review as positive, negative or neutral.\n{{review}}" },
  ],
  providers: [{ id: "mock", type: "mock", model: "mock-1" }],
  tests: [
    { id: "pos", vars: { review: "Absolutely love it, fast and friendly!" }, assert: [{ type: "equals", value: "positive", ignore_case: true }] },
    { id: "neg", vars: { review: "Arrived broken. Total waste of money." }, assert: [{ type: "equals", value: "negative", ignore_case: true }] },
    { id: "mixed", vars: { review: "Great battery but a terrible screen." }, assert: [{ type: "icontains", value: "neutral" }] },
  ],
};
const providers = { mock: new MockProvider() };

describe("runSuite", () => {
  it("runs the prompts × providers × cases matrix with events", async () => {
    const events: string[] = [];
    const run = await runSuite({ suite, providers, onEvent: (e) => events.push(e.type) });
    expect(run.cells).toHaveLength(6);
    expect(events[0]).toBe("start");
    expect(events.at(-1)).toBe("done");
    expect(events.filter((e) => e === "cell-done")).toHaveLength(6);
    expect(run.cells.every((c) => c.source === "mock")).toBe(true);
  });

  it("respects the concurrency limit", async () => {
    let inflight = 0;
    let peak = 0;
    const slow: Provider = {
      id: "mock",
      model: "slow",
      complete: async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        return { text: "positive", usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 5, source: "mock", model: "slow" } as Completion;
      },
    };
    await runSuite({ suite, providers: { mock: slow }, concurrency: 2 });
    expect(peak).toBe(2);
  });

  it("records provider errors per cell without crashing the run", async () => {
    const broken: Provider = { id: "mock", model: "x", complete: async () => Promise.reject(new HttpError("bad key", 401)) };
    const run = await runSuite({ suite, providers: { mock: broken } });
    expect(run.cells.every((c) => c.error?.includes("bad key") && !c.pass)).toBe(true);
  });

  it("can be cancelled with an AbortSignal", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runSuite({ suite, providers, signal: ctrl.signal })).rejects.toThrow(/Abort/);
  });

  it("plans and estimates runs (repeats, filters)", () => {
    expect(planRun({ suite, repeats: 3 })).toHaveLength(18);
    expect(planRun({ suite, promptIds: ["v1"], testIds: ["pos"] })).toHaveLength(1);
    const est = estimateRun({ suite });
    expect(est.calls).toBe(6);
    expect(est.usd).toBe(0);
    expect(est.inputTokens).toBeGreaterThan(50);
  });
});

describe("retry, backoff and rate limiting", () => {
  it("retries 429s honouring Retry-After, then succeeds", async () => {
    let calls = 0;
    const p: Provider = {
      id: "p",
      model: "m",
      complete: async () => {
        calls++;
        if (calls < 3) throw new HttpError("rate limited", 429, 2000);
        return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, source: "live", model: "m" };
      },
    };
    const waits: number[] = [];
    const res = await completeWithRetry(p, { messages: [] }, { retries: 4, baseMs: 100, sleep: async (ms) => void waits.push(ms) });
    expect(res.text).toBe("ok");
    expect(calls).toBe(3);
    expect(waits.every((w) => w >= 2000)).toBe(true);
  });

  it("does not retry non-retryable errors and gives up after N retries", async () => {
    const auth: Provider = { id: "p", model: "m", complete: vi.fn(async () => Promise.reject(new HttpError("nope", 401))) };
    await expect(completeWithRetry(auth, { messages: [] }, { retries: 3, baseMs: 1, sleep: async () => {} })).rejects.toThrow("nope");
    expect(auth.complete).toHaveBeenCalledTimes(1);
    const down: Provider = { id: "p", model: "m", complete: vi.fn(async () => Promise.reject(new HttpError("down", 503))) };
    await expect(completeWithRetry(down, { messages: [] }, { retries: 2, baseMs: 1, sleep: async () => {} })).rejects.toThrow("down");
    expect(down.complete).toHaveBeenCalledTimes(3);
  });

  it("backoff grows exponentially with jitter and caps at 60s", () => {
    expect(backoffDelay(0, 1000, undefined, () => 0)).toBe(500);
    expect(backoffDelay(3, 1000, undefined, () => 1)).toBe(8000);
    expect(backoffDelay(20, 1000, undefined, () => 1)).toBe(60000);
    expect(backoffDelay(0, 1000, 5000, () => 0)).toBe(5000);
  });

  it("rate limiter spaces requests per provider", async () => {
    let now = 0;
    const slept: number[] = [];
    const rl = new RateLimiter(60, async (ms) => void slept.push(ms), () => now);
    await rl.acquire("a");
    await rl.acquire("a");
    await rl.acquire("b");
    await rl.acquire("a");
    expect(slept).toEqual([1000, 2000]);
    now = 10_000;
    rl.penalize("b", 5000);
    await rl.acquire("b");
    expect(slept.at(-1)).toBe(5000);
  });
});

describe("OpenAI-compatible provider", () => {
  it("posts chat completions and maps usage; never leaks the key in errors", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gemini-3.5-flash-lite");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer AIzaFAKEKEY0123456789");
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 7, completion_tokens: 2 } }), { status: 200 });
    });
    const p = new OpenAICompatibleProvider({ id: "g", type: "gemini", model: "gemini-3.5-flash-lite", jsonMode: true }, "AIzaFAKEKEY0123456789", fetchImpl as unknown as typeof fetch);
    const r = await p.complete({ messages: [{ role: "user", content: "x" }] });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(r).toMatchObject({ text: "hi", usage: { inputTokens: 7, outputTokens: 2 }, source: "live" });

    const failing = vi.fn(async () => new Response("invalid key AIzaFAKEKEY0123456789 / Bearer sk-abcdefghijklmnopqrstuvwxyz", { status: 429, headers: { "retry-after": "3" } }));
    const p2 = new OpenAICompatibleProvider({ id: "o", type: "openai", model: "gpt-4.1-mini" }, "sk-abcdefghijklmnopqrstuvwxyz", failing as unknown as typeof fetch);
    const err = (await p2.complete({ messages: [] }).catch((e) => e)) as HttpError;
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(3000);
    expect(err.message).not.toContain("FAKEKEY0123456789");
    expect(err.message).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});

const fakeRun = (statuses: Record<string, boolean[]>, promptId = "v1", id = "r"): RunResult => ({
  id,
  suiteName: "S",
  suiteHash: "h",
  startedAt: "",
  finishedAt: "",
  promptIds: [promptId],
  providerIds: ["p"],
  testIds: Object.keys(statuses),
  repeats: Math.max(...Object.values(statuses).map((s) => s.length)),
  cells: Object.entries(statuses).flatMap(([testId, passes]) =>
    passes.map((pass, repeat) => ({
      key: `${promptId}|p|${testId}|${repeat}`,
      promptId,
      providerId: "p",
      testId,
      repeat,
      messages: [],
      output: pass ? "ok" : "bad",
      latencyMs: 100 + repeat,
      usage: { inputTokens: 10, outputTokens: 5 },
      costUsd: 0.001,
      source: "mock" as const,
      assertions: [{ type: "contains", pass, score: pass ? 1 : 0, reason: pass ? "found" : "missing <x>", weight: 1 }],
      score: pass ? 1 : 0,
      pass,
    })),
  ),
});

describe("regression & flakiness analysis", () => {
  it("detects regressions, fixes and flaky cases between columns", () => {
    const base = fakeRun({ a: [true, true], b: [true, true], c: [false, false], d: [true, true], e: [true, true] }, "v1");
    const head = fakeRun({ a: [false, false], b: [false, false], c: [true, true], d: [true, false], e: [true, true] }, "v2");
    const cmp = compareColumns(base, "v1|p", head, "v2|p");
    expect(cmp.regressions.map((r) => r.testId)).toEqual(["a", "b", "d"]);
    expect(cmp.fixes.map((r) => r.testId)).toEqual(["c"]);
    expect(cmp.flaky.map((r) => r.testId)).toEqual(["d"]);
    expect(cmp.headline).toBe("2 cases that passed in v1 · p now fail in v2 · p · 1 became flaky · 1 fixed");
    expect(cmp.passRateBefore).toBe(0.8);
    expect(cmp.passRateAfter).toBe(0.4);
  });
  it("reports no regressions when nothing got worse", () => {
    const r = fakeRun({ a: [true] });
    expect(compareColumns(r, "v1|p", r, "v1|p").headline).toMatch(/No regressions/);
  });
  it("finds flaky cases across repeats and summarizes columns", () => {
    const run = fakeRun({ a: [true, false, true], b: [true, true, true] });
    expect(findFlaky(run)).toEqual([{ column: "v1|p", testId: "a", passes: 2, total: 3 }]);
    const [s] = summarizeRun(run);
    expect(s).toMatchObject({ cases: 2, passed: 1, flaky: 1, failed: 0 });
    expect(s.costUsd).toBeCloseTo(0.006);
    expect(s.latencyP50).toBe(101);
  });
});

describe("reporters", () => {
  it("writes valid-looking JUnit XML with escaped failures", () => {
    const xml = toJUnit(fakeRun({ a: [true], "b<&>": [false] }));
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain('tests="2" failures="1"');
    expect(xml).toContain('name="b&lt;&amp;&gt;"');
    expect(xml).toContain("missing &lt;x&gt;");
    expect((xml.match(/<testcase /g) ?? []).length).toBe(2);
  });
  it("writes a markdown summary with a regression banner", () => {
    const base = fakeRun({ a: [true] }, "v1");
    const head = fakeRun({ a: [false] }, "v1");
    const md = toMarkdown(head, compareColumns(base, "v1|p", head, "v1|p"));
    expect(md).toContain("Regression detected");
    expect(md).toContain("| `v1` | `p` | **0%**");
    expect(md).toContain("### Regressions");
  });
});
