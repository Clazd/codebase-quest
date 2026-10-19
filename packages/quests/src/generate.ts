import { findDefinition, functionStatements, parse, type Stmt } from "@codebase-quest/combat/node";
import type { CodeGraph, FactBook, Language, WorldModel } from "@codebase-quest/shared";
import type { Node } from "web-tree-sitter";
import { type Atlas, AtlasSchema, hash, type Objective, type QuestDef } from "./model.ts";

export { parseCoverage, readCoverage } from "./coverage.ts";

export type ReadSource = (path: string) => { text: string; language: Language } | null;
const children = (n: Node | null): Node[] => (n ? n.namedChildren.filter((c): c is Node => Boolean(c)) : []);
function descendants(n: Node): Node[] {
  return [n, ...children(n).flatMap(descendants)];
}
/** Strict adjacent assignment→argument flow in one lexical block. No alias or dynamic inference. */
export function dataFlows(
  root: Node,
  owner: string,
  resolveCall: (line: number, name: string) => string | null,
): Atlas["deliveries"] {
  const results: Atlas["deliveries"] = [];
  for (const block of descendants(root).filter((n) => ["statement_block", "block"].includes(n.type))) {
    const stmts = children(block).filter((n) => n.type !== "comment");
    for (let i = 0; i < stmts.length - 1; i++) {
      const statement = stmts[i],
        next = stmts[i + 1];
      if (!statement || !next) continue;
      const decls = descendants(statement).filter((n) => n.type === "variable_declarator");
      if (decls.length !== 1 || !["lexical_declaration", "variable_declaration"].includes(statement.type)) continue;
      const decl = decls[0];
      if (!decl) continue;
      const name = decl.childForFieldName("name"),
        value = decl.childForFieldName("value");
      const valueCall = value?.type === "await_expression" ? children(value)[0] : value;
      if (name?.type !== "identifier" || valueCall?.type !== "call_expression") continue;
      const from = resolveCall(valueCall.startPosition.row + 1, valueCall.childForFieldName("function")?.text ?? "");
      // Only an immediate, unconditional call consumes the value. Nested branches are not a flow proof.
      const expression =
        next.type === "return_statement" || next.type === "expression_statement" ? children(next)[0] : null;
      const call = expression?.type === "await_expression" ? children(expression)[0] : expression;
      if (call?.type !== "call_expression") continue;
      const args = children(call.childForFieldName("arguments"));
      const to = resolveCall(call.startPosition.row + 1, call.childForFieldName("function")?.text ?? "");
      if (from && to && args.some((a) => a.type === "identifier" && a.text === name.text))
        results.push({ from, to, via: name.text, line: name.startPosition.row + 1, owner });
    }
  }
  return results;
}
function steps(
  stmts: Stmt[],
  depth = 0,
  route: "then" | "else" | null = null,
  guards: ("then" | "else")[] = [],
): Atlas["symbols"][number]["steps"] {
  return stmts.flatMap((s) => [
    {
      line: s.startLine,
      text: s.text.slice(0, 220),
      depth,
      branch: s.kind === "if" ? s.cond.text.slice(0, 120) : null,
      route,
      guards,
    },
    ...(s.kind === "if"
      ? [
          ...steps(s.consequent, depth + 1, "then", [...guards, "then"]),
          ...steps(s.else ?? [], depth + 1, "else", [...guards, "else"]),
        ]
      : s.kind === "loop" || s.kind === "try"
        ? [
            ...steps(s.body, depth + 1, route, guards),
            ...(s.kind === "try"
              ? [
                  ...steps(s.catchClause?.body ?? [], depth + 1, route, guards),
                  ...steps(s.finally ?? [], depth + 1, route, guards),
                ]
              : []),
          ]
        : s.kind === "switch"
          ? s.cases.flatMap((c) => steps(c.body, depth + 1, route, guards))
          : []),
  ]);
}
export function makeQuest(
  id: string,
  type: QuestDef["type"],
  title: string,
  objectives: Objective[],
  extra: Partial<QuestDef> = {},
): QuestDef {
  return {
    id,
    type,
    title,
    summary: title,
    objectives,
    ordered: false,
    prerequisites: [],
    rewards: { xp: 80, gold: 20, items: [], keys: [] },
    regionId: null,
    path: [],
    narration: { intro: title, outro: "Your map of the code is clearer." },
    ...extra,
  };
}
/** Deterministic, source-backed atlas. No analyzed code is ever imported or executed. */
export async function generateQuests(
  world: WorldModel,
  graph: CodeGraph,
  book: FactBook,
  read: ReadSource,
  encounters: { id: string; symbolId: string | null; fightable: boolean; level?: number; kind?: string }[],
  repoId = hash(graph.repo.name),
): Promise<Atlas> {
  const npcs = new Map(world.npcs.map((n) => [n.symbolId, n])),
    symbols = graph.symbols.filter((s) => npcs.has(s.id));
  const symbolIds = new Set(symbols.map((s) => s.id));
  const exact = graph.edges.filter(
    (e) => e.kind === "calls" && e.confidence === "exact" && symbolIds.has(e.from) && symbolIds.has(e.to),
  );
  const sources = new Map<string, Node>();
  const deliveries: Atlas["deliveries"] = [];
  const atlasSymbols: Atlas["symbols"] = [];
  for (const s of symbols) {
    const sheet = book.symbols.find((f) => f.symbolId === s.id),
      file = graph.files.find((f) => f.id === s.fileId),
      npc = npcs.get(s.id);
    if (!sheet || !file || !npc) continue;
    const source = read(file.path);
    let definition: Node | null = null;
    if (source) {
      let root = sources.get(file.id);
      if (!root) {
        root = await parse(source.text, source.language);
        sources.set(file.id, root);
      }
      definition = findDefinition(root, s.range.startLine, s.range.startColumn, s.range.endLine);
    }
    if (definition)
      deliveries.push(
        ...dataFlows(definition, s.id, (line, name) => {
          const candidates = exact.filter(
            (e) => e.from === s.id && e.line === line && symbols.find((s) => s.id === e.to)?.name === name,
          );
          return candidates.length === 1 ? (candidates[0]?.to ?? null) : null;
        }),
      );
    const paired = new Set<string>();
    const callOrder = definition
      ? descendants(definition)
          .filter((n) => n.type === "call_expression" || n.type === "call" || n.type === "new_expression")
          .flatMap((n) => {
            const callee = n.childForFieldName("function") ?? n.childForFieldName("constructor");
            const name =
              callee?.childForFieldName("property")?.text ??
              callee?.childForFieldName("attribute")?.text ??
              callee?.text ??
              "";
            const found = exact.filter(
              (e) =>
                e.from === s.id &&
                e.line === n.startPosition.row + 1 &&
                symbols.find((s) => s.id === e.to)?.name === name,
            );
            if (found.length !== 1 || !found[0]) return [];
            paired.add(`${found[0].line}:${found[0].to}`);
            return [found[0].to];
          })
      : [];
    // An unpaired exact edge could precede these calls. Never silently select a
    // later call as the first: use the independently scored signature fallback.
    if (exact.some((e) => e.from === s.id && !paired.has(`${e.line}:${e.to}`))) callOrder.length = 0;
    atlasSymbols.push({
      id: s.id,
      name: s.name,
      qualifiedName: s.qualifiedName,
      kind: s.kind,
      fileId: s.fileId,
      regionId: sheet.regionId ?? "",
      hash: hash(
        definition?.text ??
          source?.text
            .split("\n")
            .slice(s.range.startLine - 1, s.range.endLine)
            .join("\n") ??
          JSON.stringify(s),
      ),
      loc: s.metrics.loc,
      signature: sheet.signature,
      doc: sheet.doc,
      parameters: s.parameters.length,
      returnType: s.returnType,
      callers: [...new Set(exact.filter((e) => e.to === s.id).map((e) => e.from))].sort(),
      callOrder,
      testedBy: sheet.testedBy.filter((t) => t.confidence === "exact").map((t) => t.symbolId ?? t.path),
      steps: definition ? steps(functionStatements(definition)) : [],
      position: npc.position,
    });
  }
  const regionForFile = (id: string) => world.regions.find((r) => r.fileIds.includes(id))?.id;
  const dependencies: Atlas["dependencies"] = [];
  for (const e of graph.edges.filter((e) => e.kind === "imports" && e.confidence === "exact")) {
    const from = regionForFile(e.from),
      to = regionForFile(e.to);
    if (!from || !to || from === to) continue;
    const existing = dependencies.find((d) => d.from === from && d.to === to);
    if (existing) existing.weight++;
    else dependencies.push({ from, to, weight: 1 });
  }
  dependencies.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  // Topological DFS, with cycle members left open. Only earlier dependencies may gate a region.
  const order: string[] = [],
    visiting = new Set<string>(),
    cycle = new Set<string>();
  function regionVisit(id: string) {
    if (order.includes(id)) return;
    if (visiting.has(id)) {
      for (const v of visiting) cycle.add(v);
      return;
    }
    visiting.add(id);
    for (const d of dependencies.filter((d) => d.from === id)) regionVisit(d.to);
    visiting.delete(id);
    order.push(id);
  }
  for (const r of world.regions) regionVisit(r.id);
  const rank = new Map(order.map((id, i) => [id, i]));
  const gates = order.flatMap((id) => {
    if (cycle.has(id)) return [];
    const strongest = dependencies
      .filter((d) => d.from === id && !cycle.has(d.to) && (rank.get(d.to) ?? 0) < (rank.get(id) ?? 0))
      .sort((a, b) => b.weight - a.weight || a.to.localeCompare(b.to))[0];
    return strongest && strongest.weight >= 2
      ? [{ regionId: id, key: `key:${strongest.to}`, sourceRegionId: strongest.to }]
      : [];
  });
  const adjacency = (id: string) => [...new Set(exact.filter((e) => e.from === id).map((e) => e.to))].sort();
  let pathSearches = 0;
  const io = new Set(
    symbols
      .filter((s) => /(?:insert|save|query|load|write|read|table|update)/i.test(s.name) || s.traits.includes("io"))
      .map((s) => s.id),
  );
  function longest(id: string, visited = new Set<string>()): string[] {
    if (++pathSearches > 10000) return [id];
    if (visited.has(id) || visited.size >= 16) return [];
    const seen = new Set([...visited, id]);
    const tails = adjacency(id)
      .filter((n) => !seen.has(n))
      .map((n) => longest(n, seen));
    const valid = tails.filter((t) => t.length && (io.has(t.at(-1) ?? "") || !adjacency(t.at(-1) ?? "").length));
    const tail = valid.sort((a, b) => b.length - a.length || a.join().localeCompare(b.join()))[0];
    return [id, ...(tail ?? [])];
  }
  const entryStarts = [
    ...new Set(graph.entryPoints.flatMap((e) => (e.symbolId && symbolIds.has(e.symbolId) ? [e.symbolId] : []))),
  ];
  const starts =
    entryStarts.length >= 3
      ? entryStarts
      : [
          ...new Set([
            ...graph.entryPoints.flatMap((e) => (e.symbolId && symbolIds.has(e.symbolId) ? [e.symbolId] : [])),
            ...symbols.filter((s) => s.exported && s.metrics.fanOut > 0).map((s) => s.id),
          ]),
        ];
  const paths = starts
    .map((id) => ({
      path: (() => {
        pathSearches = 0;
        return longest(id);
      })(),
      score: adjacency(id).length + graph.entryPoints.filter((e) => e.symbolId === id).length * 10,
    }))
    .sort((a, b) => b.score - a.score || b.path.length - a.path.length || a.path.join().localeCompare(b.path.join()))
    .slice(0, 7)
    .sort((a, b) => {
      const region = (path: string[]) => regionForFile(symbols.find((s) => s.id === path[0])?.fileId ?? "") ?? "";
      return (rank.get(region(a.path)) ?? 0) - (rank.get(region(b.path)) ?? 0);
    });
  // Small/sparse worlds get explicitly labeled surveys; never invent an exact call edge.
  while (paths.length < Math.min(3, symbols.length)) {
    const s = symbols.find((s) => !paths.some((p) => p.path[0] === s.id));
    if (!s) break;
    paths.push({ path: [s.id], score: 0 });
  }
  const quests: QuestDef[] = [];
  const first = atlasSymbols.find((s) => s.id === paths[0]?.path[0]) ?? atlasSymbols[0],
    easy = encounters
      .filter((e) => e.fightable)
      .sort(
        (a, b) =>
          (a.level ?? 1) - (b.level ?? 1) ||
          Number(b.kind === "gremlin") - Number(a.kind === "gremlin") ||
          a.id.localeCompare(b.id),
      )[0];
  const welcome: Objective[] = [
    { kind: "welcome", step: "gate" },
    { kind: "welcome", step: "readme" },
    { kind: "welcome", step: "gitling" },
  ];
  if (first) welcome.push({ kind: "talk", symbolId: first.id });
  if (easy) welcome.push({ kind: "defeat", smellId: easy.id });
  quests.push(
    makeQuest("prologue", "main", "Prologue: Meet the kingdom", welcome, {
      ordered: true,
      chapter: 0,
      path: first ? [first.id] : [],
      summary: "Enter the Gate, read the welcome scroll, meet Gitling, greet a resident and tame your first monster.",
    }),
  );
  const assigned = new Set(paths.flatMap((p) => p.path));
  const supplements = atlasSymbols.filter((s) => !assigned.has(s.id));
  paths.forEach(({ path }, index) => {
    const chapter = index + 1,
      primary = atlasSymbols.find((s) => s.id === path[0]);
    const tour = [...path, ...supplements.filter((_, i) => i % paths.length === index).map((s) => s.id)];
    const name = path.map((id) => atlasSymbols.find((s) => s.id === id)?.name ?? id).join(" → ");
    quests.push(
      makeQuest(
        `chapter:${chapter}`,
        "main",
        `Chapter ${chapter}: ${primary?.name ?? "Architecture survey"}`,
        tour.flatMap(
          (symbolId) =>
            [
              { kind: "talk", symbolId },
              {
                kind: "answer",
                symbolId,
                puzzleTypes: ["signature", "trace", "type-sense", "who-calls", "call-order"],
              },
            ] as Objective[],
        ),
        {
          chapter,
          ordered: true,
          prerequisites: [chapter === 1 ? "prologue" : `chapter:${chapter - 1}`],
          path,
          regionId: primary?.regionId ?? null,
          summary: `${path.length > 1 ? "Exact call path" : "Architecture survey"}: ${name}. Then inspect nearby residents' signatures; these survey stops are not call edges.`,
          rewards: {
            xp: 1500 * chapter,
            gold: 35,
            items: ["hint"],
            keys: [...new Set(tour.map((id) => `key:${atlasSymbols.find((s) => s.id === id)?.regionId}`))],
          },
        },
      ),
    );
  });
  for (const r of world.regions) {
    const buildings = world.buildings.filter((b) => b.regionId === r.id).sort((a, b) => a.id.localeCompare(b.id));
    if (buildings.length)
      quests.push(
        makeQuest(
          `explore:${r.id}`,
          "exploration",
          `Explore ${r.name}`,
          buildings.slice(0, Math.ceil(buildings.length * 0.8)).map((b) => ({ kind: "visit", buildingId: b.id })),
          { regionId: r.id },
        ),
      );
    const residents = atlasSymbols.filter((s) => s.regionId === r.id).map((s) => s.id);
    if (residents.length)
      quests.push(
        makeQuest(`collect:${r.id}`, "collection", `Codex of ${r.name}`, [{ kind: "collect", codexIds: residents }], {
          regionId: r.id,
          rewards: { xp: 80, gold: 20, items: [], keys: [`key:${r.id}`] },
        }),
      );
    const hunts = encounters
      .filter((e) => e.fightable && atlasSymbols.some((s) => s.id === e.symbolId && s.regionId === r.id))
      .slice(0, 5);
    if (hunts.length)
      quests.push(
        makeQuest(
          `bounty:${r.id}`,
          "bounty",
          `Tame the monsters of ${r.name}`,
          hunts.map((e) => ({ kind: "defeat", smellId: e.id })),
          { regionId: r.id },
        ),
      );
  }
  for (const d of deliveries)
    quests.push(
      makeQuest(
        `delivery:${hash(JSON.stringify(d))}`,
        "delivery",
        `Carry ${d.via}`,
        [{ kind: "deliver", path: [d.from, d.to] }],
        {
          ordered: true,
          path: [d.from, d.to],
          summary: `Assignment followed by a direct argument in ${symbols.find((s) => s.id === d.owner)?.name}, line ${d.line}.`,
        },
      ),
    );
  // Local top-level registration is lexical evidence, not a guessed call edge.
  for (const [fileId, root] of sources)
    for (const node of descendants(root).filter(
      (n) => n.type === "call_expression" && /\.use$/.test(n.childForFieldName("function")?.text ?? ""),
    )) {
      const args = children(node.childForFieldName("arguments"));
      if (args.length < 2 || args.some((a) => a.type !== "identifier")) continue;
      const path = args.flatMap((arg) => {
        let ancestor = node.parent;
        while (ancestor && ancestor.type !== "program") {
          if (
            ["function_declaration", "arrow_function", "function_expression", "method_definition"].includes(
              ancestor.type,
            )
          )
            return [];
          ancestor = ancestor.parent;
        }
        const found = symbols.filter((s) => s.fileId === fileId && s.name === arg.text && s.parentId === null);
        const declaration = found[0];
        if (found.length !== 1 || !declaration) return [];
        const def = findDefinition(
          root,
          declaration.range.startLine,
          declaration.range.startColumn,
          declaration.range.endLine,
        );
        if (def?.type !== "function_declaration") return [];
        // Reject later reassignment of the callback binding.
        if (
          descendants(root).some(
            (n) => n.type === "assignment_expression" && n.childForFieldName("left")?.text === arg.text,
          )
        )
          return [];
        return [declaration.id];
      });
      if (path.length === args.length)
        quests.push(
          makeQuest(
            `escort:${hash(`${fileId}:${node.startIndex}`)}`,
            "escort",
            "Walk the middleware chain",
            [{ kind: "deliver", path }],
            { ordered: true, path },
          ),
        );
    }
  for (const query of ["email", "password", "cache", "task", "date", "team"]) {
    const answers = atlasSymbols
      .filter((s) => `${s.name} ${s.doc ?? ""}`.toLowerCase().includes(query))
      .map((s) => s.id);
    if (answers.length)
      quests.push(
        makeQuest(`find:${query}`, "investigation", `Find ${query}`, [
          { kind: "find", query, answerSymbolIds: answers },
        ]),
      );
  }
  return AtlasSchema.parse({
    version: 1,
    repoId,
    commit: graph.repo.commit,
    quests,
    symbols: atlasSymbols,
    dependencies,
    gates,
    deliveries,
    assertions: graph.testFacts.map((t) => ({
      symbolId: t.calleeSymbolId,
      path: graph.files.find((f) => f.id === t.testFileId)?.path ?? "",
      line: t.line,
    })),
    dailyCandidates: encounters
      .filter((e) => e.fightable && e.symbolId && symbolIds.has(e.symbolId))
      .map((e) => ({ encounterId: e.id, symbolId: e.symbolId as string })),
    files: graph.files.map((f) => ({
      id: f.id,
      path: f.path,
      hash: f.hash,
      buildingId: world.buildings.find((b) => b.fileIds.includes(f.id))?.id ?? null,
      imports: graph.edges
        .filter(
          (e) =>
            e.kind === "imports" &&
            e.confidence === "exact" &&
            e.from === f.id &&
            graph.files.some((f) => f.id === e.to),
        )
        .map((e) => e.to),
      importers: graph.edges
        .filter(
          (e) =>
            e.kind === "imports" &&
            e.confidence === "exact" &&
            e.to === f.id &&
            graph.files.some((f) => f.id === e.from),
        )
        .map((e) => e.from),
      firstCommitAt: f.git?.firstCommitAt ?? null,
      lastCommitAt: f.git?.lastCommitAt ?? null,
      coverage: null,
    })),
    readme:
      graph.files.find((f) => /(^|\/)readme\.md$/i.test(f.path))?.docs?.slice(0, 3000) ??
      "Welcome. Follow the real imports and calls to understand this kingdom.",
    finale: "Awaiting Phase 09: the Architect's Shadow",
  });
}
