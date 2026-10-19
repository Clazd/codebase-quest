import type { FactSheet } from "@codebase-quest/shared";
import en from "../locales/en.json" with { type: "json" };
import { suspiciousReasons } from "./validate.ts";

/** Localized dialogue strings: rule ID → variants with `{placeholder}`s. */
export type DialogueLocale = { dialogue: Record<string, string[]> };
export type Vars = Record<string, string | number>;
export interface DialogueRule {
  id: string;
  priority: number;
  when: (facts: FactSheet) => boolean;
  vars?: (facts: FactSheet) => Vars;
}
export interface DialogueLine {
  ruleId: string;
  text: string;
}
const callable = (f: FactSheet) => f.kind === "function" || f.kind === "method";
const isTest = (f: FactSheet) => f.traits.includes("test");
const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).slice(0, 2).join(", ")} and ${names.at(-1)}`;

/** Ordered by priority; the highest matching rule wins. Facts only, never guesses. */
export const RULES: readonly DialogueRule[] = [
  {
    id: "doc",
    priority: 100,
    // Doc comments are repository data: never quote one that reads like markup or an injected instruction.
    when: (f) => Boolean(f.docSummary) && suspiciousReasons(f.docSummary ?? "").length === 0,
    vars: (f) => ({ doc: f.docSummary ?? "" }),
  },
  {
    id: "trainer",
    priority: 95,
    when: (f) => isTest(f) && f.tests.length > 0,
    vars: (f) => ({ targets: list(f.tests.map((t) => t.name)) }),
  },
  { id: "recursive", priority: 90, when: (f) => f.traits.includes("recursive") },
  { id: "deprecated", priority: 88, when: (f) => f.traits.includes("deprecated") },
  { id: "busy", priority: 80, when: (f) => f.metrics.fanIn >= 5, vars: (f) => ({ fanIn: f.metrics.fanIn }) },
  {
    id: "lonely",
    priority: 75,
    when: (f) => callable(f) && !isTest(f) && f.metrics.fanIn === 0 && !f.exported,
  },
  {
    id: "complex",
    priority: 70,
    when: (f) => f.metrics.cyclomatic >= 10,
    vars: (f) => ({ cyclomatic: f.metrics.cyclomatic }),
  },
  {
    id: "constructor",
    priority: 65,
    when: (f) => f.traits.includes("constructor"),
    vars: (f) => ({ owner: f.group.label }),
  },
  { id: "handler", priority: 62, when: (f) => f.traits.includes("event-handler") },
  { id: "async", priority: 60, when: (f) => f.async || f.traits.includes("async") },
  {
    id: "io",
    priority: 55,
    // Direct callees that do I/O: a true, one-hop fact even when this symbol has no I/O call itself.
    when: (f) => f.ioVia.length > 0,
    vars: (f) => ({ ioKinds: list(f.ioVia) }),
  },
  { id: "ioDirect", priority: 54, when: (f) => f.traits.includes("does-io") && f.ioVia.length === 0 },
  { id: "pure", priority: 45, when: (f) => f.traits.includes("pure-candidate") && !isTest(f) },
  {
    id: "tested",
    priority: 40,
    when: (f) => f.testedBy.length > 0,
    vars: (f) => ({ testFile: [...new Set(f.testedBy.map((t) => t.path))].slice(0, 2).join(" and ") }),
  },
  { id: "untested", priority: 35, when: (f) => callable(f) && !isTest(f) && f.testedBy.length === 0 },
  { id: "classHead", priority: 30, when: (f) => f.kind === "class" },
  { id: "typeShape", priority: 30, when: (f) => f.kind === "interface" || f.kind === "type" },
  { id: "greeting", priority: 0, when: () => true },
];

/** FNV-1a: a tiny browser-safe string hash for variant choice. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** Mulberry32 seeded from the world seed, symbol and rule: the same world always says the same line. */
export function variantIndex(seed: string, symbolId: string, ruleId: string, count: number): number {
  let t = (fnv(`${seed}#${symbolId}#${ruleId}`) + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * count;
}
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Missing dialogue placeholder {${key}}`);
    return String(value);
  });
}
export function matchingRules(facts: FactSheet): DialogueRule[] {
  return RULES.filter((r) => r.when(facts)).sort((a, b) => b.priority - a.priority);
}
export function winningRule(facts: FactSheet): string {
  return matchingRules(facts)[0]?.id ?? "greeting";
}
/** 1–3 lines from the highest-priority matching rules (the greeting only fills an empty dialogue). */
export function dialogueFor(facts: FactSheet, seed: string, locale: DialogueLocale = en, max = 3): DialogueLine[] {
  const rules = matchingRules(facts);
  const chosen = rules.filter((r) => r.id !== "greeting").slice(0, max);
  if (!chosen.length) chosen.push(...rules.filter((r) => r.id === "greeting"));
  return chosen.map((rule) => {
    const variants = locale.dialogue[rule.id];
    if (!variants?.length) throw new Error(`No dialogue strings for rule ${rule.id}`);
    const template = variants[Math.floor(variantIndex(seed, facts.symbolId, rule.id, variants.length))] ?? "";
    return {
      ruleId: rule.id,
      text: fill(template, { name: facts.displayName, short: facts.name, file: facts.path, ...rule.vars?.(facts) }),
    };
  });
}
