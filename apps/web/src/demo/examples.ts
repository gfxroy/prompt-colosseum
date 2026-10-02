import { parseSuite, type Suite } from "@colosseum/core";
import json from "../../../../examples/suites/json-extraction.yaml?raw";
import support from "../../../../examples/suites/support-tone.yaml?raw";
import rag from "../../../../examples/suites/rag-grounding.yaml?raw";
import safety from "../../../../examples/suites/safety-refusals.yaml?raw";

export interface Example {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  yaml: string;
}

export const EXAMPLES: Example[] = [
  { id: "json-extraction", emoji: "🧾", title: "JSON extraction", blurb: "Schema, JSONPath, nulls, ISO dates + 2 prompt injections", yaml: json },
  { id: "support-tone", emoji: "💬", title: "Support tone", blurb: "LLM-as-judge rubric, policy, length, PII leak checks", yaml: support },
  { id: "rag-grounding", emoji: "📚", title: "RAG grounding", blurb: "Citations, faithfulness judge, “I don't know” on unanswerables", yaml: rag },
  { id: "safety-refusals", emoji: "🛡️", title: "Safety refusals", blurb: "Refuse harmful asks, catch over-refusal of benign ones", yaml: safety },
];

export function exampleSuite(id: string): Suite {
  const ex = EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
  return parseSuite(ex.yaml);
}
