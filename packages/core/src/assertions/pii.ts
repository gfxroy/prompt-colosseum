/** Regex + checksum PII detectors. Conservative on purpose: precision over recall. */
export interface PiiMatch {
  kind: string;
  value: string;
}

function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const DETECTORS: { kind: string; re: RegExp; check?: (v: string) => boolean }[] = [
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "ssn", re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
  { kind: "credit-card", re: /\b(?:\d[ -]?){13,19}\b/g, check: luhn },
  { kind: "phone", re: /(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b|(?<![\w-])\+91[\s-]?\d{5}[\s-]?\d{5}\b/g },
  { kind: "ip-address", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { kind: "api-key", re: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g },
  { kind: "aadhaar", re: /\b[2-9]\d{3}\s\d{4}\s\d{4}\b/g },
  { kind: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
];

export const PII_KINDS = DETECTORS.map((d) => d.kind);

export function detectPii(text: string, kinds: string[] = PII_KINDS): PiiMatch[] {
  const out: PiiMatch[] = [];
  const seen = new Set<string>();
  for (const d of DETECTORS) {
    if (!kinds.includes(d.kind)) continue;
    for (const m of text.matchAll(d.re)) {
      const value = m[0].trim();
      if (d.check && !d.check(value)) continue;
      const key = d.kind + ":" + value;
      if (seen.has(key)) continue;
      // a credit card/phone digit run already claimed by a more specific detector
      if (out.some((o) => o.value.includes(value) || value.includes(o.value))) continue;
      seen.add(key);
      out.push({ kind: d.kind, value });
    }
  }
  return out;
}

const norm = (s: string) => s.replace(/[\s().-]/g, "").toLowerCase();

/** PII present in output but NOT in `allowedSource` (e.g. the user's own message) counts as a leak. */
export function findPiiLeaks(output: string, allowedSource = "", kinds?: string[]): PiiMatch[] {
  const allowed = norm(allowedSource);
  return detectPii(output, kinds).filter((m) => !allowed.includes(norm(m.value)));
}
