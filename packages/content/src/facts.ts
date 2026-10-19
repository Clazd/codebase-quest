import {
  type CodeGraph,
  type Edge,
  type FactBook,
  FactBookSchema,
  type FactLink,
  type FactSheet,
  type SymbolNode,
  type WorldModel,
} from "@codebase-quest/shared";
import { mask } from "../../analyzer/src/util.ts";

const RANK = { exact: 0, likely: 1, guess: 2 } as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Doc comment text without `/** *\/`, `#` or `"""` markers, with obvious secrets masked. */
export function cleanDoc(doc: string | null): string | null {
  if (!doc) return null;
  const text = doc
    .replace(/^\s*(?:\/\*\*?|"""|''')/, "")
    .replace(/(?:\*\/|"""|''')\s*$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\*(?!\/)|#|\/\/\/?)\s?/, "").trimEnd())
    .join("\n")
    .trim();
  return text ? mask(text) : null;
}
/** The first sentence of a cleaned doc comment (tags such as `@param` are not prose). */
export function firstSentence(doc: string | null): string | null {
  const prose = doc
    ?.split(/\n\s*(?:@|\n)/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (!prose) return null;
  const match = /^.*?[.!?](?=\s|$)/.exec(prose);
  const sentence = (match?.[0] ?? prose).trim();
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
}
export function displayName(symbol: Pick<SymbolNode, "kind" | "name">): string {
  if (symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type")
    return `${symbol.kind} ${symbol.name}`;
  return `${symbol.name}()`;
}
export function signature(symbol: SymbolNode, python: boolean): string {
  const params = symbol.parameters.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(", ");
  if (symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type")
    return `${symbol.kind} ${symbol.name}`;
  if (python)
    return `${symbol.async ? "async " : ""}def ${symbol.name}(${params})${symbol.returnType ? ` -> ${symbol.returnType}` : ""}`;
  const prefix = symbol.kind === "method" ? "" : "function ";
  return `${symbol.async ? "async " : ""}${prefix}${symbol.name}${symbol.generator ? "*" : ""}(${params})${symbol.returnType ? `: ${symbol.returnType}` : ""}`;
}

/** Deterministic fact sheets for every symbol, joined to its NPC/building/region placement. */
export function buildFactBook(graph: CodeGraph, world: WorldModel): FactBook {
  const files = new Map(graph.files.map((f) => [f.id, f]));
  const modules = new Map(graph.modules.map((m) => [m.id, m]));
  const symbols = new Map(graph.symbols.map((s) => [s.id, s]));
  const npcs = new Map(world.npcs.map((n) => [n.symbolId, n]));
  const buildings = new Map(world.buildings.map((b) => [b.id, b]));
  const link = (edge: Edge, other: string): FactLink => {
    const symbol = symbols.get(other),
      file = files.get(symbol?.fileId ?? other);
    return {
      symbolId: symbol ? symbol.id : null,
      name: symbol ? symbol.name : (file?.path ?? other),
      path: file?.path ?? "",
      line: symbol && other === edge.to ? symbol.range.startLine : edge.line,
      confidence: edge.confidence,
    };
  };
  const unique = (links: FactLink[]) => {
    const best = new Map<string, FactLink>();
    for (const l of links) {
      const key = l.symbolId ?? `${l.path}:${l.name}`,
        old = best.get(key);
      if (!old || RANK[l.confidence] < RANK[old.confidence] || (l.confidence === old.confidence && l.line < old.line))
        best.set(key, l);
    }
    return [...best.values()].sort(
      (a, b) => RANK[a.confidence] - RANK[b.confidence] || compare(a.name, b.name) || compare(a.path, b.path),
    );
  };
  const incoming = new Map<string, Edge[]>(),
    outgoing = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "calls" && edge.kind !== "tests") continue;
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  const sheets: FactSheet[] = [];
  for (const symbol of [...graph.symbols].sort((a, b) => compare(a.id, b.id))) {
    const file = files.get(symbol.fileId);
    if (!file) continue;
    let owner: SymbolNode | undefined = symbol.parentId ? symbols.get(symbol.parentId) : undefined;
    while (owner && owner.kind !== "class") owner = owner.parentId ? symbols.get(owner.parentId) : undefined;
    const classOwner = symbol.kind === "class" ? symbol : owner;
    const module = modules.get(file.moduleId);
    const npc = npcs.get(symbol.id),
      building = npc ? buildings.get(npc.buildingId) : undefined;
    const doc = cleanDoc(symbol.doc);
    const into = incoming.get(symbol.id) ?? [],
      out = outgoing.get(symbol.id) ?? [];
    const testers = unique(into.filter((e) => e.kind === "tests").map((e) => link(e, e.from)));
    const callees = unique(out.filter((e) => e.kind === "calls").map((e) => link(e, e.to)));
    sheets.push({
      symbolId: symbol.id,
      npcId: npc?.id ?? null,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      displayName: displayName(symbol),
      kind: symbol.kind,
      language: file.language,
      fileId: file.id,
      path: file.path,
      regionId: building?.regionId ?? null,
      buildingId: building?.id ?? null,
      group: classOwner
        ? { kind: "class", key: classOwner.id, label: classOwner.name }
        : { kind: "module", key: file.moduleId, label: module?.path ?? "." },
      range: { startLine: symbol.range.startLine, endLine: symbol.range.endLine },
      signature: signature(symbol, file.language === "python"),
      doc,
      docSummary: firstSentence(doc),
      exported: symbol.exported,
      async: symbol.async,
      traits: [...symbol.traits].sort(compare),
      metrics: symbol.metrics,
      callers: unique(into.filter((e) => e.kind === "calls").map((e) => link(e, e.from))),
      callees,
      testedBy: testers.filter((t) => t.symbolId || !testers.some((o) => o.symbolId && o.path === t.path)),
      tests: unique(out.filter((e) => e.kind === "tests").map((e) => link(e, e.to))),
      ioVia: [
        ...new Set(
          callees.flatMap((c) => (c.symbolId && symbols.get(c.symbolId)?.traits.includes("does-io") ? [c.name] : [])),
        ),
      ].sort(compare),
    });
  }
  return FactBookSchema.parse({
    schemaVersion: 1,
    repo: { name: graph.repo.name, commit: graph.repo.commit },
    files: [...graph.files]
      .sort((a, b) => compare(a.id, b.id))
      .map((f) => ({ id: f.id, path: f.path, language: f.language, hash: f.hash, loc: f.loc })),
    symbols: sheets,
    links: null,
  });
}
