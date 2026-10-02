/**
 * Tiny, dependency-free prompt template engine (Mustache/Handlebars flavoured).
 *
 *   {{ name }}                       variable (dotted paths ok: {{ user.name }})
 *   {{ name | upper }}               filters: upper, lower, trim, json, length, truncate:N, default:"x", join:", ", indent:N
 *   {{#if cond}} … {{else}} … {{/if}}   {{#unless cond}} … {{/unless}}
 *   {{#each items}} {{@index}}: {{this}} {{/each}}
 *
 * Rendering is plain text (no HTML escaping) and never executes code, so shared suites are safe.
 */

type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; expr: string; filters: Filter[] }
  | { kind: "if"; expr: string; negate: boolean; then: Node[]; else: Node[] }
  | { kind: "each"; expr: string; body: Node[] };

interface Filter {
  name: string;
  arg?: string;
}

export class TemplateError extends Error {}

const TAG = /\{\{\s*([\s\S]*?)\s*\}\}/g;

function parseFilters(src: string): { expr: string; filters: Filter[] } {
  // split on | that are not inside quotes
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "|") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const [expr, ...rest] = parts.map((p) => p.trim());
  const filters = rest.map((f) => {
    const idx = f.indexOf(":");
    if (idx === -1) return { name: f.trim() };
    let arg = f.slice(idx + 1).trim();
    if (/^(['"]).*\1$/s.test(arg)) arg = arg.slice(1, -1);
    return { name: f.slice(0, idx).trim(), arg };
  });
  return { expr, filters };
}

export function parseTemplate(src: string): Node[] {
  const root: Node[] = [];
  const stack: { node: Node; target: Node[] }[] = [];
  let target = root;
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    const idx = m.index ?? 0;
    if (idx > last) target.push({ kind: "text", value: src.slice(last, idx) });
    last = idx + m[0].length;
    const body = m[1];
    if (body.startsWith("#if ") || body.startsWith("#unless ")) {
      const negate = body.startsWith("#unless");
      const node: Node = { kind: "if", expr: body.replace(/^#(if|unless)\s+/, "").trim(), negate, then: [], else: [] };
      target.push(node);
      stack.push({ node, target });
      target = node.then;
    } else if (body.startsWith("#each ")) {
      const node: Node = { kind: "each", expr: body.slice(6).trim(), body: [] };
      target.push(node);
      stack.push({ node, target });
      target = node.body;
    } else if (body === "else") {
      const top = stack[stack.length - 1];
      if (!top || top.node.kind !== "if") throw new TemplateError("{{else}} without {{#if}}");
      target = top.node.else;
    } else if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      const top = stack.pop();
      if (!top) throw new TemplateError(`Unexpected {{/${name}}}`);
      const expected = top.node.kind === "each" ? "each" : (top.node as { negate: boolean }).negate ? "unless" : "if";
      if (name !== expected) throw new TemplateError(`Expected {{/${expected}}} but found {{/${name}}}`);
      target = top.target;
    } else if (body.startsWith("!")) {
      // comment
    } else {
      const { expr, filters } = parseFilters(body);
      if (!expr) throw new TemplateError("Empty variable tag {{ }}");
      target.push({ kind: "var", expr, filters });
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1].node;
    throw new TemplateError(`Unclosed {{#${open.kind === "each" ? "each" : "if"}}} block`);
  }
  if (last < src.length) root.push({ kind: "text", value: src.slice(last) });
  return root;
}

type Scope = { vars: Record<string, unknown>; local: Record<string, unknown> };

function lookup(expr: string, scope: Scope): { found: boolean; value: unknown } {
  if (expr === "this" || expr.startsWith("@")) {
    return expr in scope.local ? { found: true, value: scope.local[expr] } : { found: false, value: undefined };
  }
  const path = expr.startsWith("this.") ? expr.slice(5).split(".") : expr.split(".");
  let cur: unknown = expr.startsWith("this.") ? scope.local.this : scope.vars;
  if (!expr.startsWith("this.") && scope.local.this && typeof scope.local.this === "object" && path[0] in (scope.local.this as object)) {
    cur = scope.local.this;
  }
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as object)) cur = (cur as Record<string, unknown>)[key];
    else return { found: false, value: undefined };
  }
  return { found: true, value: cur };
}

export function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function applyFilter(value: unknown, f: Filter): unknown {
  switch (f.name) {
    case "upper":
      return stringify(value).toUpperCase();
    case "lower":
      return stringify(value).toLowerCase();
    case "trim":
      return stringify(value).trim();
    case "json":
      return JSON.stringify(value ?? null);
    case "length":
      return Array.isArray(value) ? value.length : stringify(value).length;
    case "truncate": {
      const n = Number(f.arg ?? 100);
      const s = stringify(value);
      return s.length > n ? s.slice(0, n) + "…" : s;
    }
    case "default":
      return value === undefined || value === null || value === "" ? (f.arg ?? "") : value;
    case "join":
      return Array.isArray(value) ? value.map(stringify).join(f.arg ?? ", ") : stringify(value);
    case "indent": {
      const pad = " ".repeat(Number(f.arg ?? 2));
      return stringify(value)
        .split("\n")
        .map((l) => pad + l)
        .join("\n");
    }
    default:
      throw new TemplateError(`Unknown filter "${f.name}"`);
  }
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export interface RenderResult {
  text: string;
  missing: string[];
}

export function render(src: string, vars: Record<string, unknown>): RenderResult {
  const nodes = parseTemplate(src);
  const missing = new Set<string>();
  const walk = (list: Node[], scope: Scope): string =>
    list
      .map((n) => {
        switch (n.kind) {
          case "text":
            return n.value;
          case "var": {
            const { found, value } = lookup(n.expr, scope);
            const hasDefault = n.filters.some((f) => f.name === "default");
            if (!found && !hasDefault) missing.add(n.expr);
            return stringify(n.filters.reduce(applyFilter, value));
          }
          case "if": {
            const v = truthy(lookup(n.expr, scope).value);
            return walk(v !== n.negate ? n.then : n.else, scope);
          }
          case "each": {
            const { found, value } = lookup(n.expr, scope);
            if (!found) missing.add(n.expr);
            if (!Array.isArray(value)) return "";
            return value
              .map((item, i) =>
                walk(n.body, { vars: scope.vars, local: { this: item, "@index": i, "@number": i + 1, "@first": i === 0, "@last": i === value.length - 1 } }),
              )
              .join("");
          }
        }
      })
      .join("");
  return { text: walk(nodes, { vars, local: {} }), missing: [...missing] };
}

/** Top-level variable names referenced by a template (for the editor + validation). */
export function extractVariables(src: string): string[] {
  const out = new Set<string>();
  const visit = (list: Node[], inEach: boolean) => {
    for (const n of list) {
      if (n.kind === "var" || n.kind === "if" || n.kind === "each") {
        const head = n.expr.split(".")[0];
        // inside {{#each}} bare names usually refer to fields of the current item
        if (head !== "this" && !head.startsWith("@") && !(inEach && n.kind !== "each")) out.add(head);
      }
      if (n.kind === "if") {
        visit(n.then, inEach);
        visit(n.else, inEach);
      } else if (n.kind === "each") visit(n.body, true);
    }
  };
  visit(parseTemplate(src), false);
  return [...out];
}
