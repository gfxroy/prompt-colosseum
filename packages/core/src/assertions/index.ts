import Ajv from "ajv";
import { render } from "../template";
import { buildJudgeMessages, parseJudgeResponse } from "../judge";
import { queryPath } from "./jsonpath";
import { normalizeAssertion } from "./registry";
import { findPiiLeaks } from "./pii";
import { detectRefusal } from "./refusal";
import { cosine, lexicalSimilarity } from "./similarity";
import type { AssertionResult, AssertionSpec, ChatMessage, Completion, Embedder, Usage } from "../types";

export { ASSERTION_DOCS, ASSERTION_TYPES, normalizeAssertion } from "./registry";
export { detectPii, findPiiLeaks, PII_KINDS } from "./pii";
export { detectRefusal } from "./refusal";
export { lexicalSimilarity, cosine } from "./similarity";
export { queryPath } from "./jsonpath";

export interface AssertionContext {
  output: string;
  vars: Record<string, unknown>;
  messages: ChatMessage[];
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  judge?: (messages: ChatMessage[]) => Promise<Completion>;
  embedder?: Embedder;
}

let ajv: Ajv | null = null;
const getAjv = () => (ajv ??= new Ajv({ allErrors: true, strict: false }));

/** Parses JSON from model output; optionally accepts ```json fenced blocks. */
export function parseJsonOutput(output: string, allowFences = false): { ok: true; value: unknown } | { ok: false; error: string } {
  let text = output.trim();
  if (allowFences) {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (m) text = m[1].trim();
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const hint = /```/.test(output) && !allowFences ? " (output is wrapped in a ``` code fence)" : "";
    return { ok: false, error: `not valid JSON${hint}: ${(e as Error).message.slice(0, 80)}` };
  }
}

const str = (v: unknown, vars: Record<string, unknown>) => (typeof v === "string" ? render(v, vars).text : String(v ?? ""));
const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n) + "…" : s);
const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Raw = { pass: boolean; score?: number; reason: string; details?: Record<string, unknown> };

async function evaluateRaw(spec: AssertionSpec, ctx: AssertionContext): Promise<Raw> {
  const out = ctx.output;
  const vars = ctx.vars;
  const value = spec.value !== undefined ? str(spec.value, vars) : "";
  const values = Array.isArray(spec.values) ? spec.values.map((v) => str(v, vars)) : [];
  switch (spec.type) {
    case "equals": {
      const ic = Boolean(spec.ignore_case);
      const pass = ic ? out.trim().toLowerCase() === value.trim().toLowerCase() : out.trim() === value.trim();
      return { pass, reason: pass ? `equals "${short(value)}"` : `expected "${short(value)}", got "${short(out.trim())}"` };
    }
    case "contains":
    case "icontains": {
      const ic = spec.type === "icontains";
      let pass = ic ? out.toLowerCase().includes(value.toLowerCase()) : out.includes(value);
      if (!pass && spec.normalize) {
        // catches S-E-C-R-E-T, "s e c r e t" and reversed spellings
        const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        const hay = squash(out);
        const needle = squash(value);
        pass = needle.length > 0 && (hay.includes(needle) || hay.includes([...needle].reverse().join("")));
      }
      return { pass, reason: pass ? `found "${short(value)}"` : `"${short(value)}" not found` };
    }
    case "contains-any": {
      const hit = values.filter((v) => out.toLowerCase().includes(v.toLowerCase()));
      return { pass: hit.length > 0, score: hit.length ? 1 : 0, reason: hit.length ? `found ${hit.map((h) => `"${h}"`).join(", ")}` : `none of ${values.length} values found` };
    }
    case "contains-all": {
      const missing = values.filter((v) => !out.toLowerCase().includes(v.toLowerCase()));
      return { pass: !missing.length, score: values.length ? (values.length - missing.length) / values.length : 1, reason: missing.length ? `missing ${missing.map((m) => `"${m}"`).join(", ")}` : `all ${values.length} values found` };
    }
    case "starts-with": {
      const pass = out.trimStart().startsWith(value);
      return { pass, reason: pass ? `starts with "${short(value)}"` : `starts with "${short(out.trimStart(), 20)}"` };
    }
    case "regex": {
      const re = new RegExp(str(spec.value ?? spec.pattern, vars), String(spec.flags ?? ""));
      const m = out.match(re);
      return { pass: Boolean(m), reason: m ? `matched "${short(m[0])}"` : `no match for /${re.source}/` };
    }
    case "length": {
      const unit = spec.unit === "words" ? "words" : "chars";
      const n = unit === "words" ? (out.trim().match(/\S+/g) ?? []).length : out.length;
      const min = spec.min !== undefined ? Number(spec.min) : -Infinity;
      const max = spec.max !== undefined ? Number(spec.max) : Infinity;
      const pass = n >= min && n <= max;
      return { pass, reason: `${n} ${unit}${pass ? "" : n > max ? ` > max ${max}` : ` < min ${min}`}` };
    }
    case "is-json": {
      const r = parseJsonOutput(out, Boolean(spec.allow_fences));
      return { pass: r.ok, reason: r.ok ? "valid JSON" : r.error };
    }
    case "json-schema": {
      const r = parseJsonOutput(out, Boolean(spec.allow_fences));
      if (!r.ok) return { pass: false, reason: r.error };
      const validate = getAjv().compile((spec.schema ?? {}) as object);
      const ok = validate(r.value);
      const errs = (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
      return { pass: ok, reason: ok ? "matches schema" : errs.slice(0, 3).join("; "), details: { errors: errs } };
    }
    case "json-path": {
      const r = parseJsonOutput(out, Boolean(spec.allow_fences));
      if (!r.ok) return { pass: false, reason: r.error };
      const path = String(spec.path ?? "$");
      const hits = queryPath(r.value, path);
      const got = hits.length === 1 ? hits[0] : hits;
      if ("equals" in spec) {
        const expected = typeof spec.equals === "string" ? str(spec.equals, vars) : spec.equals;
        const pass = hits.length > 0 && (deepEqual(got, expected) || (typeof got === "string" && typeof expected === "string" && got.trim().toLowerCase() === expected.trim().toLowerCase()));
        return { pass, reason: pass ? `${path} = ${short(JSON.stringify(expected))}` : `${path} = ${hits.length ? short(JSON.stringify(got)) : "(missing)"}, expected ${short(JSON.stringify(expected))}` };
      }
      if ("contains" in spec) {
        const needle = str(spec.contains, vars).toLowerCase();
        const pass = hits.some((h) => JSON.stringify(h).toLowerCase().includes(needle));
        return { pass, reason: pass ? `${path} contains "${needle}"` : `${path} lacks "${needle}"` };
      }
      if ("matches" in spec) {
        const re = new RegExp(String(spec.matches));
        const pass = hits.length > 0 && hits.every((h) => re.test(String(h)));
        return { pass, reason: pass ? `${path} matches /${re.source}/` : `${path} = ${short(JSON.stringify(got))} doesn't match /${re.source}/` };
      }
      const exists = spec.exists !== false;
      const found = hits.length > 0 && hits.some((h) => h !== null && h !== undefined);
      return { pass: exists === found, reason: found ? `${path} present` : `${path} missing or null` };
    }
    case "latency": {
      const max = Number(spec.max_ms ?? spec.max ?? 5000);
      return { pass: ctx.latencyMs <= max, reason: `${Math.round(ctx.latencyMs)} ms${ctx.latencyMs > max ? ` > ${max} ms` : ""}` };
    }
    case "cost": {
      const max = Number(spec.max_usd ?? spec.max ?? 0.01);
      return { pass: ctx.costUsd <= max, reason: `$${ctx.costUsd.toFixed(6)}${ctx.costUsd > max ? ` > $${max}` : ""}` };
    }
    case "tokens": {
      const max = Number(spec.max ?? 500);
      return { pass: ctx.usage.outputTokens <= max, reason: `${ctx.usage.outputTokens} output tokens${ctx.usage.outputTokens > max ? ` > ${max}` : ""}` };
    }
    case "similar": {
      let score: number;
      let method: string;
      if (ctx.embedder) {
        const [a, b] = await ctx.embedder.embed([out, value]);
        score = cosine(a, b);
        method = ctx.embedder.name;
      } else {
        score = lexicalSimilarity(out, value);
        method = "lexical (no embedder)";
      }
      const threshold = Number(spec.threshold ?? (ctx.embedder ? 0.75 : 0.35));
      return { pass: score >= threshold, score, reason: `similarity ${score.toFixed(2)} ${score >= threshold ? "≥" : "<"} ${threshold} via ${method}`, details: { method, reference: value } };
    }
    case "llm-rubric": {
      if (!ctx.judge) return { pass: false, score: 0, reason: "no judge provider configured" };
      const rubric = str(spec.value ?? spec.rubric, vars);
      const input = [...ctx.messages].reverse().find((m) => m.role === "user")?.content;
      const messages = buildJudgeMessages(rubric, out, spec.include_input === false ? undefined : input);
      const res = await ctx.judge(messages);
      const verdict = parseJudgeResponse(res.text);
      const threshold = Number(spec.threshold ?? 0.7);
      const details = { judgePrompt: messages, judgeResponse: res.text, judgeModel: res.model, judgeSource: res.source };
      if (!verdict) return { pass: false, score: 0, reason: "judge returned unparseable output", details };
      const pass = verdict.score >= threshold;
      return { pass, score: verdict.score, reason: `judge ${verdict.score.toFixed(2)}${pass ? " ≥ " : " < "}${threshold}: ${verdict.reason}`, details };
    }
    case "refusal": {
      const v = detectRefusal(out);
      return { pass: v.refused, score: v.refused ? v.confidence : 0, reason: v.refused ? `refusal detected (${v.signals.slice(0, 2).map((s) => `"${short(s, 40)}"`).join(", ")})` : "no refusal detected", details: { signals: v.signals } };
    }
    case "no-pii": {
      const kinds = Array.isArray(spec.kinds) ? (spec.kinds as string[]) : undefined;
      const allowed = spec.allow_from_input === false ? "" : ([...ctx.messages].reverse().find((m) => m.role === "user")?.content ?? "");
      const leaks = findPiiLeaks(out, allowed, kinds);
      return { pass: !leaks.length, reason: leaks.length ? `leaked ${leaks.map((l) => `${l.kind} ${l.value}`).join(", ")}` : "no PII leaked", details: { leaks } };
    }
    default:
      return { pass: false, score: 0, reason: `unknown assertion type "${spec.type}"` };
  }
}

export async function evaluateAssertion(rawSpec: AssertionSpec, ctx: AssertionContext): Promise<AssertionResult> {
  const spec = normalizeAssertion(rawSpec);
  const label = (spec.not ? "not-" : "") + spec.type;
  const weight = spec.weight === undefined ? 1 : Number(spec.weight);
  try {
    const raw = await evaluateRaw(spec, ctx);
    let pass = raw.pass;
    let score = raw.score ?? (raw.pass ? 1 : 0);
    if (spec.not) {
      pass = !pass;
      score = 1 - score;
    }
    return { type: label, pass, score, reason: raw.reason, weight, details: raw.details };
  } catch (e) {
    return { type: label, pass: false, score: 0, reason: `error: ${(e as Error).message}`, weight };
  }
}

export interface CaseScore {
  pass: boolean;
  score: number;
}

/** Weighted score; by default every assertion must pass. */
export function scoreCase(results: AssertionResult[], threshold = 1, requireAll = true): CaseScore {
  if (!results.length) return { pass: true, score: 1 };
  const total = results.reduce((a, r) => a + r.weight, 0) || 1;
  const score = results.reduce((a, r) => a + r.weight * (r.pass ? 1 : 0), 0) / total;
  const pass = requireAll ? results.every((r) => r.pass || r.weight === 0) && score >= Math.min(threshold, 1) : score >= threshold;
  return { pass, score };
}
