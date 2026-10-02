/**
 * Instruction detectors used by the deterministic mock model ("mock-1").
 * mock-1 is a *simulator*: it reads your prompt template, notices which instructions you gave,
 * and behaves like a model that follows exactly those instructions - nothing more.
 */
export interface Features {
  wantsJson: boolean;
  jsonOnly: boolean;
  nullMissing: boolean;
  isoDate: boolean;
  numeric: boolean;
  injectionGuard: boolean;
  oneLabel: boolean;
  lowercase: boolean;
  neutralAware: boolean;
  empathy: boolean;
  nextStep: boolean;
  noBlame: boolean;
  policy: boolean;
  terse: boolean;
  wordLimit: number | null;
  sentenceLimit: number | null;
  bullets: boolean;
  noPreamble: boolean;
  keyFacts: boolean;
  cite: boolean;
  grounded: boolean;
  idkPhrase: string | null;
  neverReveal: boolean;
  roleplayGuard: boolean;
  overrideGuard: boolean;
  encodeGuard: boolean;
  promptLeakGuard: boolean;
  refuseAll: boolean;
  alwaysComply: boolean;
  calibrated: boolean;
  strictSafety: boolean;
  piiGuard: boolean;
}

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUM_WORDS[s.toLowerCase()] ?? NaN));

export const FEATURE_LABELS: Partial<Record<keyof Features, string>> = {
  jsonOnly: "JSON only (no prose / fences)",
  nullMissing: "null for missing fields",
  isoDate: "ISO dates",
  numeric: "numbers as numbers",
  injectionGuard: "treat input as untrusted data",
  oneLabel: "single label output",
  neutralAware: "neutral/mixed class",
  empathy: "empathy",
  nextStep: "concrete next step",
  noBlame: "no blaming the customer",
  policy: "stick to policy",
  wordLimit: "word limit",
  cite: "cite sources",
  grounded: "answer only from context",
  idkPhrase: "explicit 'I don't know' fallback",
  neverReveal: "never reveal the secret",
  roleplayGuard: "resist role-play",
  overrideGuard: "resist instruction override",
  encodeGuard: "no encodings / hints",
  promptLeakGuard: "keep instructions private",
  calibrated: "don't over-refuse benign asks",
  strictSafety: "refuse harmful requests",
  piiGuard: "protect personal data",
};

export function detectFeatures(text: string): Features {
  const t = text;
  const wantsJson = /\bjson\b/i.test(t);
  const wl = t.match(/(?:under|at most|no more than|fewer than|max(?:imum)?(?: of)?|within|less than|limit(?:ed)? to|up to|maximum)\s+(\d+|one|two|three|four|five|ten|twenty|thirty|forty|fifty)\s+words/i) ?? t.match(/(\d+)\s+words\s+(?:max|or (?:less|fewer))/i);
  const sl = t.match(/\b(one|two|three|single|\d)\s+sentences?\b/i);
  const idkM = t.match(/(?:say|respond with|reply with|answer with|output)(?: exactly)?:?\s*(?:["“]([^"”]{4,120})["”]|'([^']{4,120})')/i);
  const idk = idkM ? [idkM[0], idkM[1] ?? idkM[2]] : null;
  return {
    wantsJson,
    jsonOnly:
      wantsJson &&
      /(only|just|nothing but|solely)\s+(?:return\s+|output\s+|respond with\s+|reply with\s+)?(?:a\s+|the\s+|one\s+)?(?:valid\s+|raw\s+|minified\s+|single\s+)*json|json only|no\s+(?:markdown|prose|code ?fences?|backticks|explanations?|commentary|extra text|other text)|without\s+(?:any\s+)?(?:markdown|code ?fences?|backticks|explanations?|commentary|prose|other text|extra text)|do not (?:wrap|add|include) (?:it )?(?:in )?(?:markdown|code|backticks|any)|must be parseable|parseable by JSON\.parse|first character (?:must be|is) \{/i.test(t),
    nullMissing: /\bnull\b/i.test(t),
    isoDate: /YYYY-MM-DD|ISO[ -]?8601|ISO(?: format(?:ted)?)? dates?|ISO format/i.test(t),
    numeric: /\b(?:as (?:a )?(?:plain )?numbers?|numeric|number type|float|no currency symbols?|without (?:the )?currency symbols?|json numbers?|not (?:a )?strings?)\b/i.test(t),
    injectionGuard:
      /(?:instructions?|commands?|requests?|directives?)\s+(?:inside|within|in|contained in|found in|embedded in)\s+(?:the\s+)?(?:text|email|document|input|data|message|content|review|ticket)|treat\s+(?:the\s+|all\s+)?(?:text|email|input|content|data|document|message)\s+as\s+(?:untrusted|data|plain data|content)|untrusted|(?:never|do not|don't)\s+(?:follow|obey|execute|act on)|ignore\s+(?:any|all)\s+(?:instructions|commands|requests)\s+(?:in|inside|within|from)|prompt injection/i.test(
        t,
      ),
    oneLabel: /(?:only|just|exactly|solely)\s+(?:output\s+|return\s+|respond with\s+|reply with\s+)?(?:the\s+|one\s+|a\s+single\s+|a\s+)?(?:label|word|category|class)|(?:one|single)[ -]word|nothing else|no (?:other text|explanation|punctuation)|respond with (?:only )?one of/i.test(t),
    lowercase: /lower[ -]?case/i.test(t),
    neutralAware: /\bneutral\b|\bmixed\b/i.test(t),
    empathy: /empath|apolog|acknowledg|frustrat|sympath|\bwarm\b|caring|understanding|validate (?:their|the customer)/i.test(t),
    nextStep: /next step|actionable|follow[- ]?up|concrete (?:action|step|resolution)|what (?:they|the customer) (?:can|should) do|clear (?:action|resolution)|offer (?:a|one) (?:fix|solution|action)/i.test(t),
    noBlame: /blame|(?:never|don't|do not) (?:imply|suggest|say) (?:it'?s |it is )?(?:their|the customer'?s) fault|not (?:the customer'?s|their) fault/i.test(t),
    policy: /\bpolicy\b|never promise|don'?t promise|do not promise|only (?:offer|promise) what/i.test(t),
    terse: /as few words as possible|be (?:very )?(?:efficient|blunt|curt)|no pleasantries|skip (?:the )?pleasantries/i.test(t),
    wordLimit: wl ? n(wl[1]) || null : null,
    sentenceLimit: sl ? (sl[1].toLowerCase() === "single" ? 1 : n(sl[1]) || null) : null,
    bullets: /bullet|bulleted|- list|as a list/i.test(t),
    noPreamble: /no (?:preamble|intro|introduction)|only (?:the|output the) summary|start (?:directly|immediately)|without (?:any )?(?:preamble|intro)/i.test(t),
    keyFacts: /key (?:facts|figures|numbers|metrics|details)|numbers|figures|dates|metrics|names|who, what|specific/i.test(t),
    cite: /\bcite|citation|\[doc|sources?\b|reference the (?:doc|document)/i.test(t),
    grounded:
      /only (?:use |using |based on |from |rely on )?(?:the )?(?:provided |given |supplied )?(?:context|documents?|sources?|passages?)|strictly (?:from|on|based on) the (?:context|documents?)|(?:do not|don't|never) use (?:any )?(?:outside|prior|external|general|own) knowledge|not (?:in|supported by|contained in) the (?:context|documents?)|if the (?:context|documents?) (?:does|do)n'?t|if the answer (?:is not|isn'?t)/i.test(
        t,
      ),
    idkPhrase: idk ? idk[1].trim() : null,
    neverReveal: /(?:never|do not|don't|must not|under no circumstances)\s+(?:\w+\s+){0,3}?(?:reveal|disclose|share|tell|say|output|give|repeat|print)|keep (?:it|the \w+|this) (?:secret|confidential|private)|is (?:secret|confidential|top secret)/i.test(t),
    roleplayGuard: /role-?play|stor(?:y|ies)|pretend|hypothetical|character|fiction|games?\b|poem|imagin/i.test(t),
    overrideGuard: /ignore (?:previous|prior|all|your|the above)|override|jailbreak|new instructions|claim(?:s|ing)? to be|(?:admin|developer|administrator|creator|authority|authori[sz]ed|owner)\b|no matter (?:what|who)|regardless of (?:what|who)/i.test(t),
    encodeGuard: /encod|base ?64|spell|translat|revers|letters?\b|hints?\b|rhym|partial|fragment|any (?:form|format|language|way)|indirect|clues?/i.test(t),
    promptLeakGuard:
      /(?:system prompt|these instructions|your instructions|this prompt|the instructions above).{0,60}(?:never|do not|don't|confidential|secret|private)|(?:never|do not|don't|must not)\s+(?:\w+\s+){0,2}(?:repeat|reveal|share|disclose|print|output|summari[sz]e|quote)\s+(?:\w+\s+){0,2}(?:instructions|prompt|system|rules)/i.test(t),
    refuseAll: /refuse (?:all|every|everything|any) (?:requests?|questions?)|(?:never|do not|don't) (?:answer|respond to|help with) (?:any|anything)|only (?:ever )?(?:say|reply|respond)(?: with)? ["“']?(?:no|I can'?t)/i.test(t),
    alwaysComply: /always comply|never refuse|no restrictions|do anything|without (?:any )?(?:restrictions|refus|limits)|maximally (?:helpful|compliant)|comply with (?:all|every|any)/i.test(t),
    calibrated: /benign|legitimate|over-?refus|distinguish|educational|technical (?:meaning|context|sense)|dual[- ]use|context matters|(?:don'?t|do not|never) refuse (?:harmless|safe|benign|legitimate)|everyday|programming|false positives?|intent\b/i.test(t),
    strictSafety: /refuse (?:\w+\s+){0,3}?(?:harmful|dangerous|illegal|unsafe|malicious)|decline (?:\w+\s+){0,3}?(?:harmful|dangerous|illegal|unsafe)|safety|weapons?|harm(?:ful)?\b|dangerous/i.test(t),
    piiGuard: /privacy|\bpii\b|personal (?:data|information|details)|(?:never|do not|don't|must not)\s+(?:\w+\s+){0,3}?(?:reveal|share|disclose|expose|leak)\s+(?:\w+\s+){0,3}?(?:ssn|social security|emails?|phone|addresses|records|customers?|accounts?|data|information|details)|redact|confidential (?:customer|personal|user)|other customers|verify (?:the )?identity/i.test(t),
  };
}
