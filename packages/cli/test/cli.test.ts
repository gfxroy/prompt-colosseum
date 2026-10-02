import { mkdtempSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bossById } from "@colosseum/core";
import { main, type Io } from "../src/app";

const ROOT = resolve(__dirname, "../../..");
const SUITE = join(ROOT, "examples/suites/json-extraction.yaml");

function makeIo(env: Record<string, string | undefined> = {}, fetchImpl?: typeof fetch) {
  const out: string[] = [];
  const err: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), "colosseum-"));
  const io: Io = { out: (s) => out.push(s), err: (s) => err.push(s), env, cwd, fetchImpl };
  return { io, out, err, cwd, text: () => out.join("\n") + err.join("\n") };
}

describe("colosseum CLI", () => {
  it("prints help and version", async () => {
    const t = makeIo();
    expect(await main(["--help"], t.io)).toBe(0);
    expect(t.text()).toContain("colosseum run <suite.yaml>");
    expect(await main(["--version"], t.io)).toBe(0);
  });

  it("returns 2 on usage errors", async () => {
    const t = makeIo();
    expect(await main(["frobnicate"], t.io)).toBe(2);
    expect(await main(["run"], t.io)).toBe(2);
    expect(await main(["run", "nope.yaml"], t.io)).toBe(2);
    expect(await main(["run", SUITE, "--bogus-flag"], t.io)).toBe(2);
  });

  it("refuses live providers without a key and names the env var", async () => {
    const t = makeIo();
    expect(await main(["run", SUITE, "--provider", "flash-lite"], t.io)).toBe(2);
    expect(t.text()).toMatch(/GEMINI_API_KEY/);
  });

  it("validates example suites", async () => {
    for (const f of ["json-extraction", "support-tone", "rag-grounding", "safety-refusals"]) {
      const t = makeIo();
      expect(await main(["validate", join(ROOT, `examples/suites/${f}.yaml`)], t.io)).toBe(0);
    }
  });

  it("runs a suite with --mock and writes json, junit and markdown", async () => {
    const t = makeIo();
    const code = await main(["run", SUITE, "--mock", "--repeats", "1", "--json", "out/r.json", "--junit", "out/r.xml", "--md", "out/r.md", "--fail-on", "none"], t.io);
    expect(code).toBe(0);
    const run = JSON.parse(readFileSync(join(t.cwd, "out/r.json"), "utf8"));
    expect(run.cells.length).toBeGreaterThan(0);
    expect(readFileSync(join(t.cwd, "out/r.xml"), "utf8")).toMatch(/<testsuites/);
    expect(readFileSync(join(t.cwd, "out/r.md"), "utf8")).toMatch(/\|/);
  });

  it("fails on failures by default and passes with --fail-on none", async () => {
    const t = makeIo();
    expect(await main(["run", SUITE, "--mock", "--prompt", "v2", "--quiet"], t.io)).toBe(1);
    expect(await main(["run", SUITE, "--mock", "--prompt", "v2", "--quiet", "--fail-on", "none"], t.io)).toBe(0);
  });

  it("flags v1 → v2 regressions with --compare and appends to GITHUB_STEP_SUMMARY", async () => {
    const t = makeIo();
    const summary = join(t.cwd, "summary.md");
    t.io.env.GITHUB_STEP_SUMMARY = summary;
    const code = await main(["run", SUITE, "--mock", "--compare", "v1,v2", "--repeats", "1"], t.io);
    expect(code).toBe(1);
    expect(t.text()).toMatch(/now fail/);
    expect(existsSync(summary)).toBe(true);
    expect(readFileSync(summary, "utf8")).toMatch(/Prompt Colosseum|regress/i);
  });

  it("baseline mode: identical run passes, regressed prompt fails", async () => {
    const t = makeIo();
    expect(await main(["run", SUITE, "--mock", "--prompt", "v1", "--repeats", "1", "--json", "base.json", "--quiet", "--fail-on", "none"], t.io)).toBe(0);
    expect(await main(["run", SUITE, "--mock", "--prompt", "v1", "--repeats", "1", "--baseline", "base.json", "--quiet"], t.io)).toBe(0);
    // Pretend v2 is the new version of v1: rewrite the suite so the "v1" id carries v2's template.
    const yaml = readFileSync(SUITE, "utf8");
    copyFileSync(SUITE, join(t.cwd, "orig.yaml"));
    const swapped = yaml.replace(/id: v1\b/, "id: old").replace(/id: v2\b/, "id: v1");
    writeFileSync(join(t.cwd, "swapped.yaml"), swapped);
    expect(await main(["run", "swapped.yaml", "--mock", "--prompt", "v1", "--repeats", "1", "--baseline", "base.json"], t.io)).toBe(1);
    expect(t.text()).toMatch(/regress|now fail/i);
    expect(await main(["compare", "base.json", "base.json"], t.io)).toBe(0);
  });

  it("init writes a runnable starter suite", async () => {
    const t = makeIo();
    expect(await main(["init", "s.yaml"], t.io)).toBe(0);
    expect(await main(["init", "s.yaml"], t.io)).toBe(2);
    expect(await main(["run", "s.yaml", "--quiet", "--fail-on", "none"], t.io)).toBe(0);
  });

  it("lists bosses and wins a battle with the reference solution", async () => {
    const t = makeIo();
    expect(await main(["bosses"], t.io)).toBe(0);
    expect(t.text()).toContain("sentimentus");
    writeFileSync(join(t.cwd, "p.txt"), bossById("sentimentus")!.solution);
    expect(await main(["battle", "sentimentus", "-p", "p.txt"], t.io)).toBe(0);
    expect(t.text()).toMatch(/VICTORY/);
    writeFileSync(join(t.cwd, "weak.txt"), bossById("sentimentus")!.starter);
    expect(await main(["battle", "sentimentus", "-p", "weak.txt"], t.io)).toBe(1);
  });

  it("calls the OpenAI-compatible endpoint with the key and never prints it", async () => {
    const SECRET = ["fake", "key", "for", "tests"].join("-"); // not a real key
    const calls: { url: string; auth: string | null }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init.headers).get("authorization") });
      const body = JSON.parse(String(init.body));
      const user = body.messages.at(-1).content as string;
      const content = /json/i.test(user) ? '{"name":"Ada","email":"ada@example.com","amount":42}' : "ok";
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const t = makeIo({ GEMINI_API_KEY: SECRET }, fakeFetch);
    await main(["run", SUITE, "--provider", "flash-lite", "--prompt", "v1", "--test", ids(SUITE)[0], "--repeats", "1", "--json", "live.json", "--fail-on", "none"], t.io);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
    expect(calls[0].auth).toBe(`Bearer ${SECRET}`);
    expect(t.text()).not.toContain(SECRET);
    expect(readFileSync(join(t.cwd, "live.json"), "utf8")).not.toContain(SECRET);
  });
});

function ids(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/^\s+- id: ([\w-]+)\s*$/gm)].map((m) => m[1]).filter((x) => !/^(v\d|flash-lite|mock|judge)$/.test(x));
}
