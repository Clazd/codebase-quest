import type { FactBook, FactSheet } from "@codebase-quest/shared";
import type { AnswerGuard } from "./guard.ts";
import { type ContentItem, type ContentType, type ItemFacts, OUTPUT_SCHEMAS, type Ref } from "./types.ts";

export type Validation<T = unknown> = { ok: true; value: T } | { ok: false; reasons: string[] };
export interface ValidationContext {
  book: Pick<FactBook, "files" | "symbols">;
  guard?: AnswerGuard;
}

/** Common technical words that look like identifiers but are not claims about this code. */
const COMMON = new Set(
  "JavaScript TypeScript GitHub GitLab NodeJS Node.js PyPI npm pnpm JSON YAML TOML HTML CSS HTTP HTTPS API APIs URL URLs UUID SQL CLI MCP README I/O IO OAuth WebSocket iOS macOS VSCode e.g i.e etc vs Codex Gitling".split(
    " ",
  ),
);
/** Strings that indicate content is relaying injected instructions instead of describing code. */
const SUSPICIOUS: [RegExp, string][] = [
  [/https?:\/\/|www\./i, "contains a link"],
  [/<\s*[a-z/!]|&lt;|javascript:/i, "contains markup"],
  [/\]\(|```|^#{1,6}\s/m, "contains markdown"],
  [
    /ignore (?:all |any )?(?:previous|prior) instructions|developer mode|system prompt|jailbreak/i,
    "relays an injected instruction",
  ],
  [/\b(?:api[_ -]?key|password|private key|id_rsa|\.ssh|\.env\b|secret token)/i, "mentions credentials"],
  [
    /\b(?:correct|right|expected) answer\b|\banswer is [A-D]\b|mark (?:every|all) answers?/i,
    "talks about puzzle answers",
  ],
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects.
  [/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/, "contains control characters"],
];

/** Why a text looks like markup, a link, or a relayed instruction (empty when clean). */
export function suspiciousReasons(text: string): string[] {
  return SUSPICIOUS.filter(([pattern]) => pattern.test(text)).map(([, why]) => why);
}
/** Identifier-like tokens: `code`, calls(), camelCase, PascalCase words, snake_case, dotted names, file paths. */
export function codeIdentifiers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/`([^`]{1,80})`/g))
    for (const t of m[1]?.match(/[A-Za-z_$][\w$./-]*/g) ?? []) found.add(t);
  const stripped = text.replace(/`[^`]*`/g, " ");
  for (const m of stripped.matchAll(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\/[\w.-]+)*(\(\))?/g)) {
    const token = m[0].replace(/\(\)$/, "").replace(/\.$/, "");
    const call = Boolean(m[1]) || stripped[(m.index ?? 0) + m[0].length] === "(";
    const camel = /[a-z][A-Z]/.test(token) || /^[A-Z][a-z]+[A-Z]/.test(token);
    const snake = /[A-Za-z0-9]_[A-Za-z0-9]/.test(token);
    const dotted = /[\w$]\.[A-Za-z_$]/.test(token);
    const path = token.includes("/") || /\.(?:ts|tsx|js|jsx|mjs|cjs|py|json|md)$/.test(token);
    if ((call || camel || snake || dotted || path) && !COMMON.has(token) && !/^[A-Z0-9_]+$/.test(token))
      found.add(token);
  }
  return [...found];
}
/** Every identifier the facts make available: names, parameters, types, paths and quoted code. */
export function allowedIdentifiers(facts: ItemFacts, book?: Pick<FactBook, "symbols">): Set<string> {
  const allowed = new Set<string>();
  const add = (text: string | null | undefined) => {
    if (!text) return;
    allowed.add(text);
    for (const t of text.match(/[A-Za-z_$][\w$]*/g) ?? []) allowed.add(t);
    for (const t of text.match(/[\w$./-]+/g) ?? []) {
      allowed.add(t);
      allowed.add(t.split("/").at(-1) ?? t);
    }
  };
  const sheet = (s: FactSheet) => {
    for (const v of [s.name, s.qualifiedName, s.displayName, s.signature, s.path, s.group.label, s.doc, ...s.ioVia])
      add(v);
    for (const l of [...s.callers, ...s.callees, ...s.testedBy, ...s.tests]) {
      add(l.name);
      add(l.path);
    }
  };
  if (facts.kind === "quest") {
    add(facts.title);
    add(facts.summary);
    for (const s of facts.symbols) {
      add(s.name);
      add(s.path);
    }
  } else if (facts.kind === "symbol") {
    sheet(facts.sheet);
    for (const line of facts.code?.value ?? []) add(line);
  } else if (facts.kind === "region") {
    for (const v of [facts.region.name, facts.region.path, ...facts.files]) add(v);
    for (const s of facts.symbols) for (const v of [s.name, s.displayName, s.path]) add(v);
  } else if (facts.kind === "kingdom") {
    add(facts.name);
    for (const r of facts.regions) for (const v of [r.name, r.path]) add(v);
    for (const l of facts.languages) add(l);
  } else {
    for (const s of facts.sheets) sheet(s);
    // Gitling may name any real symbol or file in the repository.
    for (const s of book?.symbols ?? []) for (const v of [s.name, s.qualifiedName, s.path]) add(v);
  }
  return allowed;
}
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => (k === "refs" || k === "symbolIds" ? [] : texts(v)));
  return [];
}
/** A ref must name an analyzed file and overlap a symbol in it (and, when given, one of the item's symbols). */
export function checkRef(ref: Ref, ctx: ValidationContext, symbolIds?: Set<string>): string | null {
  if (ref.endLine < ref.startLine) return `${ref.path}:${ref.startLine}-${ref.endLine} has an inverted range`;
  const file = ctx.book.files.find((f) => f.path === ref.path);
  if (!file) return `${ref.path} is not a file in this repository`;
  if (ref.endLine > file.loc) return `${ref.path} has only ${file.loc} lines`;
  const overlapping = ctx.book.symbols.filter(
    (s) => s.path === ref.path && s.range.startLine <= ref.endLine && ref.startLine <= s.range.endLine,
  );
  if (!overlapping.length) return `${ref.path}:${ref.startLine}-${ref.endLine} does not overlap any symbol`;
  if (symbolIds && !overlapping.some((s) => symbolIds.has(s.symbolId)))
    return `${ref.path}:${ref.startLine}-${ref.endLine} does not overlap a symbol from the fact sheet`;
  return null;
}
function itemSymbolIds(facts: ItemFacts): Set<string> | undefined {
  if (facts.kind === "symbol") return new Set([facts.sheet.symbolId]);
  if (facts.kind === "region") return new Set(facts.symbols.map((s) => s.symbolId));
  return undefined;
}
/**
 * The one validation path for every source: schema → limits/escaping → grounding →
 * citations → answer-leak guard. Reasons are readable so agents can fix and retry.
 */
export function validateContent<T extends ContentType>(
  item: Pick<ContentItem, "contentType" | "facts">,
  output: unknown,
  ctx: ValidationContext,
): Validation<ReturnType<(typeof OUTPUT_SCHEMAS)[T]["parse"]>> {
  const parsed = OUTPUT_SCHEMAS[item.contentType].safeParse(output);
  if (!parsed.success)
    return {
      ok: false,
      reasons: parsed.error.issues.slice(0, 6).map((i) => `schema: ${i.path.join(".") || "(root)"} ${i.message}`),
    };
  const reasons: string[] = [];
  const strings = texts(parsed.data);
  for (const text of strings)
    for (const why of suspiciousReasons(text)) reasons.push(`limits: "${text.slice(0, 50)}…" ${why}`);
  const allowed = allowedIdentifiers(item.facts, ctx.book);
  const invented = [...new Set(strings.flatMap(codeIdentifiers))].filter(
    (id) => !allowed.has(id) && !id.split(/[./]/).every((part) => !part || allowed.has(part)),
  );
  if (invented.length)
    reasons.push(
      `grounding: not in the fact sheet: ${invented
        .slice(0, 8)
        .map((i) => `\`${i}\``)
        .join(", ")}`,
    );
  const refs = (parsed.data as { refs?: Ref[] }).refs ?? [];
  const ids = itemSymbolIds(item.facts);
  for (const ref of refs) {
    const problem = checkRef(ref, ctx, ids);
    if (problem) reasons.push(`citation: ${problem}`);
  }
  if (ctx.guard)
    for (const text of strings) {
      const leak = ctx.guard.leak(text);
      if (leak) reasons.push(`answer-leak: ${leak}`);
    }
  return reasons.length ? { ok: false, reasons } : { ok: true, value: parsed.data as never };
}
