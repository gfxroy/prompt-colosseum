import YAML from "yaml";
import { extractVariables, parseTemplate, TemplateError } from "./template";
import { hashHex, stableStringify } from "./hash";
import { ASSERTION_TYPES, normalizeAssertion } from "./assertions/registry";
export { normalizeAssertion };
import type { AssertionSpec, PromptVersion, ProviderConfig, Suite, TestCase } from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export class SuiteError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
  }
}

const PROVIDER_TYPES = ["mock", "openai", "gemini", "openai-compatible"];

function asArray<T>(v: unknown, mapKeyTo = "id"): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).map(([k, val]) =>
      typeof val === "object" && val !== null ? ({ [mapKeyTo]: k, ...(val as object) } as T) : ({ [mapKeyTo]: k, template: val } as T),
    );
  }
  return [];
}

/** Turns loosely-written YAML/JSON into a normalised Suite (no validation). */
export function normalizeSuite(raw: unknown): Suite {
  const r = (raw ?? {}) as Record<string, unknown>;
  const prompts = asArray<PromptVersion>(r.prompts).map((p, i) => ({
    ...p,
    id: String(p.id ?? `v${i + 1}`),
    template: String(p.template ?? (p as unknown as { user?: string }).user ?? ""),
  }));
  const providers = asArray<ProviderConfig>(r.providers).map((p, i) => ({ ...p, id: String(p.id ?? `provider-${i + 1}`), model: String(p.model ?? "mock-1") }));
  const tests = asArray<TestCase>(r.tests).map((t, i) => ({
    ...t,
    id: String(t.id ?? `case-${i + 1}`),
    vars: (t.vars ?? {}) as Record<string, unknown>,
    assert: (Array.isArray(t.assert) ? t.assert : []).map(normalizeAssertion),
  }));
  const defaults = r.defaults as Suite["defaults"];
  return {
    name: String(r.name ?? "Untitled suite"),
    description: r.description ? String(r.description) : undefined,
    prompts,
    providers: providers.length ? providers : [{ id: "mock", type: "mock", model: "mock-1" }],
    tests,
    defaults: defaults ? { ...defaults, assert: (defaults.assert ?? []).map(normalizeAssertion) } : undefined,
    judge: r.judge as Suite["judge"],
    settings: r.settings as Suite["settings"],
  };
}

export function validateSuite(suite: Suite): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) => issues.push({ path, message, severity: "warning" });
  if (!suite.prompts.length) err("prompts", "at least one prompt version is required");
  if (!suite.tests.length) err("tests", "at least one test case is required");
  const dup = (list: { id: string }[], path: string) => {
    const seen = new Set<string>();
    list.forEach((x, i) => {
      if (seen.has(x.id)) err(`${path}[${i}].id`, `duplicate id "${x.id}"`);
      seen.add(x.id);
    });
  };
  dup(suite.prompts, "prompts");
  dup(suite.providers, "providers");
  dup(suite.tests, "tests");
  const declared = new Set<string>();
  suite.prompts.forEach((p, i) => {
    for (const [field, src] of [
      ["template", p.template],
      ["system", p.system ?? ""],
    ] as const) {
      try {
        parseTemplate(src);
        extractVariables(src).forEach((v) => declared.add(v));
      } catch (e) {
        err(`prompts[${i}].${field}`, e instanceof TemplateError ? e.message : String(e));
      }
    }
    if (!p.template.trim()) err(`prompts[${i}].template`, "template is empty");
  });
  suite.providers.forEach((p, i) => {
    if (!PROVIDER_TYPES.includes(p.type)) err(`providers[${i}].type`, `unknown provider type "${p.type}" (expected ${PROVIDER_TYPES.join(", ")})`);
    if (p.type === "openai-compatible" && !p.baseUrl) err(`providers[${i}].baseUrl`, "openai-compatible providers need a baseUrl");
  });
  const providerIds = new Set(suite.providers.map((p) => p.id));
  if (suite.judge?.provider && !providerIds.has(suite.judge.provider)) err("judge.provider", `unknown provider "${suite.judge.provider}"`);
  const checkAssert = (a: AssertionSpec, path: string) => {
    if (!a || typeof a.type !== "string") return err(path, "assertion needs a type");
    if (!ASSERTION_TYPES.includes(a.type)) err(`${path}.type`, `unknown assertion "${a.type}" (known: ${ASSERTION_TYPES.join(", ")})`);
    if (a.type === "regex") {
      try {
        new RegExp(String(a.value ?? a.pattern ?? ""));
      } catch (e) {
        err(`${path}.value`, `invalid regex: ${(e as Error).message}`);
      }
    }
  };
  suite.defaults?.assert?.forEach((a, i) => checkAssert(a, `defaults.assert[${i}]`));
  suite.tests.forEach((t, i) => {
    t.assert.forEach((a, j) => checkAssert(a, `tests[${i}].assert[${j}]`));
    if (!t.assert.length && !suite.defaults?.assert?.length) warn(`tests[${i}]`, "test has no assertions (it will always pass)");
    const vars = { ...(suite.defaults?.vars ?? {}), ...t.vars };
    declared.forEach((v) => {
      if (!(v in vars)) warn(`tests[${i}].vars`, `variable "${v}" is used by a prompt but not set`);
    });
    const needsJudge = t.assert.some((a) => a.type === "llm-rubric");
    if (needsJudge && !suite.judge && !suite.providers.length) err(`tests[${i}]`, "llm-rubric needs a judge provider");
  });
  return issues;
}

export function parseSuite(text: string): Suite {
  let raw: unknown;
  try {
    raw = text.trim().startsWith("{") ? JSON.parse(text) : YAML.parse(text);
  } catch (e) {
    throw new SuiteError([{ path: "(root)", message: `could not parse: ${(e as Error).message}`, severity: "error" }]);
  }
  const suite = normalizeSuite(raw);
  const errors = validateSuite(suite).filter((i) => i.severity === "error");
  if (errors.length) throw new SuiteError(errors);
  return suite;
}

/** Removes undefined keys so YAML/JSON output stays clean. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function suiteToYaml(suite: Suite): string {
  return YAML.stringify(clean(suite), { lineWidth: 0, blockQuote: "literal" });
}

export function suiteToJson(suite: Suite): string {
  return JSON.stringify(clean(suite), null, 2);
}

export function suiteHash(suite: Suite): string {
  return hashHex(stableStringify(clean(suite)));
}
