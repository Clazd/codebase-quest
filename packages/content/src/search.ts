import type { FactBook, FactSheet } from "@codebase-quest/shared";
import type { Ref } from "./types.ts";

/** BM25 over names, paths, doc comments and code tokens. Built with the world; browser-safe. */
export interface SearchIndex {
  version: 1;
  k1: number;
  b: number;
  avgdl: number;
  docs: { symbolId: string; length: number }[];
  /** term → [docIndex, termFrequency, docIndex, termFrequency, …] */
  postings: Record<string, number[]>;
}
const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it its me of on or show tell that the this to was what when where which who why with you".split(
    " ",
  ),
);
/** A light English stemmer: "save", "saves", "saved", "saving" → "sav"; "tasks" → "task". */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && /(?:ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w.length > 3 && w.endsWith("e") ? w.slice(0, -1) : w;
}
/** Splits identifiers (camelCase, snake_case, paths) and prose into stemmed terms. */
export function tokenize(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  return words.map(stem);
}
/** Field weights: a match in the name matters more than one deep in the code. */
export function documentTerms(sheet: FactSheet, code: readonly string[] | null): string[] {
  const name = tokenize(`${sheet.name} ${sheet.qualifiedName}`);
  return [
    ...name,
    ...name,
    ...name,
    ...tokenize(sheet.path),
    ...tokenize(sheet.path),
    ...tokenize(sheet.doc ?? ""),
    ...tokenize(sheet.signature),
    ...tokenize((code ?? []).join("\n")).slice(0, 400),
  ];
}
export function buildSearchIndex(
  book: Pick<FactBook, "symbols">,
  codeOf: (sheet: FactSheet) => readonly string[] | null = () => null,
): SearchIndex {
  const docs: SearchIndex["docs"] = [];
  const postings: Record<string, number[]> = {};
  for (const sheet of [...book.symbols].sort((a, b) => (a.symbolId < b.symbolId ? -1 : 1))) {
    const terms = documentTerms(sheet, codeOf(sheet));
    const index = docs.length;
    docs.push({ symbolId: sheet.symbolId, length: terms.length });
    const counts = new Map<string, number>();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [term, tf] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const list = postings[term] ?? [];
      list.push(index, tf);
      postings[term] = list;
    }
  }
  const sorted: Record<string, number[]> = {};
  for (const term of Object.keys(postings).sort()) sorted[term] = postings[term] ?? [];
  const avgdl = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  return { version: 1, k1: 1.2, b: 0.75, avgdl: Math.round(avgdl * 1000) / 1000, docs, postings: sorted };
}
export interface SearchHit {
  symbolId: string;
  score: number;
}
export function search(index: SearchIndex, query: string, limit = 5): SearchHit[] {
  const scores = new Map<number, number>();
  const n = index.docs.length;
  for (const term of new Set(tokenize(query))) {
    const list = index.postings[term];
    if (!list) continue;
    const df = list.length / 2;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < list.length; i += 2) {
      const doc = list[i] ?? 0,
        tf = list[i + 1] ?? 0,
        length = index.docs[doc]?.length ?? 0;
      const score = (idf * tf * (index.k1 + 1)) / (tf + index.k1 * (1 - index.b + (index.b * length) / index.avgdl));
      scores.set(doc, (scores.get(doc) ?? 0) + score);
    }
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([doc, score]) => ({ symbolId: index.docs[doc]?.symbolId ?? "", score: Math.round(score * 1000) / 1000 }));
}
/** The level-1 Gitling answer: "These might help:" plus verified citations. Never invents anything. */
export function searchAnswer(
  index: SearchIndex,
  book: Pick<FactBook, "symbols">,
  question: string,
): { answer: string; refs: (Ref & { symbolId: string; name: string })[] } {
  const sheets = new Map(book.symbols.map((s) => [s.symbolId, s]));
  const hits = search(index, question, 5).flatMap((h) => {
    const s = sheets.get(h.symbolId);
    return s ? [s] : [];
  });
  if (!hits.length)
    return { answer: "I couldn't find anything matching that. Try a function, file or folder name.", refs: [] };
  return {
    answer: "These might help:",
    refs: hits.map((s) => ({
      symbolId: s.symbolId,
      name: s.displayName,
      path: s.path,
      startLine: s.range.startLine,
      endLine: s.range.endLine,
    })),
  };
}
