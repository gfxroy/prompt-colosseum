/**
 * Minimal JSONPath: $  .key  ['key']  [0]  [-1]  [*]  ..key (recursive descent).
 * Returns every match (an empty array means "no match").
 */
type Seg = { kind: "key"; key: string } | { kind: "index"; index: number } | { kind: "wild" } | { kind: "deep"; key: string };

export function parsePath(path: string): Seg[] {
  let p = path.trim();
  if (p.startsWith("$")) p = p.slice(1);
  const segs: Seg[] = [];
  const re = /^(?:\.\.([A-Za-z_$][\w$-]*)|\.([A-Za-z_$][\w$-]*)|\.\*|\[\*\]|\[(-?\d+)\]|\[\s*(['"])(.*?)\4\s*\])/;
  while (p.length) {
    const m = p.match(re);
    if (!m) throw new Error(`Invalid JSONPath near "${p}"`);
    if (m[1]) segs.push({ kind: "deep", key: m[1] });
    else if (m[2]) segs.push({ kind: "key", key: m[2] });
    else if (m[3] !== undefined) segs.push({ kind: "index", index: Number(m[3]) });
    else if (m[5] !== undefined) segs.push({ kind: "key", key: m[5] });
    else segs.push({ kind: "wild" });
    p = p.slice(m[0].length);
  }
  return segs;
}

function deepFind(node: unknown, key: string, out: unknown[]) {
  if (Array.isArray(node)) node.forEach((n) => deepFind(n, key, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      deepFind(v, key, out);
    }
  }
}

export function queryPath(data: unknown, path: string): unknown[] {
  let nodes: unknown[] = [data];
  for (const seg of parsePath(path)) {
    const next: unknown[] = [];
    for (const n of nodes) {
      if (seg.kind === "key") {
        if (n && typeof n === "object" && !Array.isArray(n) && seg.key in n) next.push((n as Record<string, unknown>)[seg.key]);
      } else if (seg.kind === "index") {
        if (Array.isArray(n)) {
          const i = seg.index < 0 ? n.length + seg.index : seg.index;
          if (i >= 0 && i < n.length) next.push(n[i]);
        }
      } else if (seg.kind === "wild") {
        if (Array.isArray(n)) next.push(...n);
        else if (n && typeof n === "object") next.push(...Object.values(n));
      } else deepFind(n, seg.key, next);
    }
    nodes = next;
  }
  return nodes;
}
