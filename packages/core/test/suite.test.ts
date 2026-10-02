import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { decodeShare, encodeShare, normalizeSuite, parseSuite, suiteHash, suiteToJson, suiteToYaml, SuiteError, validateSuite } from "../src";

const YAML_SUITE = `
name: Demo
prompts:
  v1:
    template: "Hello {{name}}"
  v2:
    system: "Be terse"
    template: "Hi {{name}} {{missing}}"
tests:
  - id: t1
    vars: { name: Ada }
    assert:
      - not-contains: x
      - type: not-icontains
        value: bye
      - is-json
`;

describe("suite parsing", () => {
  it("accepts map-style prompts, string assertions and not- sugar", () => {
    const s = normalizeSuite(YAML.parse(YAML_SUITE));
    expect(s.prompts.map((p) => p.id)).toEqual(["v1", "v2"]);
    expect(s.providers[0].type).toBe("mock");
    expect(s.tests[0].assert[1]).toMatchObject({ type: "icontains", not: true });
    expect(s.tests[0].assert[2]).toEqual({ type: "is-json" });
  });
  it("warns about unset variables and errors on unknown assertions", () => {
    const s = normalizeSuite(YAML.parse(YAML_SUITE));
    const issues = validateSuite(s);
    expect(issues.some((i) => i.severity === "warning" && i.message.includes('"missing"'))).toBe(true);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(s.tests[0].assert[0]).toEqual({ type: "contains", value: "x", not: true });
  });
  it("throws SuiteError with paths for invalid suites", () => {
    const bad = `name: x\nprompts: [{id: a, template: "{{#if x}}"}]\nproviders: [{id: p, type: claude, model: m}]\ntests: [{id: t, assert: [{type: nope}, {type: regex, value: "("}]}]`;
    try {
      parseSuite(bad);
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(SuiteError);
      const msg = (e as Error).message;
      expect(msg).toContain("prompts[0].template");
      expect(msg).toContain('unknown provider type "claude"');
      expect(msg).toContain('unknown assertion "nope"');
      expect(msg).toContain("invalid regex");
    }
    expect(() => parseSuite("::: not yaml :::\n  - [")).toThrow(SuiteError);
  });
  it("round-trips through YAML and JSON with a stable hash", () => {
    const s = parseSuite(YAML_SUITE.replace(" {{missing}}", ""));
    expect(parseSuite(suiteToYaml(s))).toEqual(s);
    expect(parseSuite(suiteToJson(s))).toEqual(s);
    expect(suiteHash(parseSuite(suiteToYaml(s)))).toBe(suiteHash(s));
  });
  it("all bundled example suites are valid", () => {
    const dir = new URL("../../../examples/suites/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const s = parseSuite(readFileSync(new URL(f, dir), "utf8"));
      expect(s.tests.length, f).toBeGreaterThan(3);
      expect(validateSuite(s).filter((i) => i.severity === "error"), f).toEqual([]);
    }
  });
});

describe("share links", () => {
  it("compress and restore a suite", async () => {
    const s = parseSuite(YAML_SUITE.replace(" {{missing}}", ""));
    const token = await encodeShare(s);
    expect(token[0]).toBe("z");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShare(token)).toEqual(JSON.parse(JSON.stringify(s)));
    await expect(decodeShare("x123")).rejects.toThrow();
  });
});
