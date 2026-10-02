/** Lexical similarity fallback (TF cosine over stemmed unigrams + bigrams) and vector cosine. */
const STOP = new Set("a an the and or but of to in on for with at by from is are was were be been it this that as i you we they he she your our their my me us them do does did not no yes so if then than can will would should could may might just".split(" "));

function stem(w: string): string {
  return w.replace(/(ing|edly|ed|ly|es|s)$/u, "") || w;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w)).map(stem);
}

function tf(text: string): Map<string, number> {
  const t = tokens(text);
  const m = new Map<string, number>();
  t.forEach((w, i) => {
    m.set(w, (m.get(w) ?? 0) + 1);
    if (i > 0) m.set(t[i - 1] + " " + w, (m.get(t[i - 1] + " " + w) ?? 0) + 0.5);
  });
  return m;
}

export function lexicalSimilarity(a: string, b: string): number {
  const ma = tf(a);
  const mb = tf(b);
  if (!ma.size || !mb.size) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  ma.forEach((v, k) => {
    na += v * v;
    const o = mb.get(k);
    if (o) dot += v * o;
  });
  mb.forEach((v) => (nb += v * v));
  return dot / Math.sqrt(na * nb);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
