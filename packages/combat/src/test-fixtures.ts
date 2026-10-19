/** biome-ignore-all lint/style/noNonNullAssertion: The language filter establishes this fixture fact. */
/** Test support: static source only. Never imports or executes fixture code. */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CodeGraphSchema } from "@codebase-quest/shared";
import { discover } from "../../analyzer/src/discover.ts";
import { analyze } from "../../analyzer/src/index.ts";
import { buildEncounters } from "../../puzzles/src/encounter.ts";
import { generate } from "../../worldgen/src/index.ts";
import { bodyForSymbol } from "./source.ts";

export async function fixture(name: string) {
  const golden = fileURLToPath(new URL(`../../analyzer/goldens/${name}.graph.json`, import.meta.url));
  const graph = existsSync(golden)
    ? CodeGraphSchema.parse(JSON.parse(readFileSync(golden, "utf8")))
    : await analyze(fileURLToPath(new URL(`../../../fixtures/repos/${name}`, import.meta.url)));
  const files = discover(fileURLToPath(new URL(`../../../fixtures/repos/${name}`, import.meta.url))).files;
  const sources = new Map(
    files
      .filter((f) => f.language)
      .map((f) => [f.path, { path: f.path, text: f.text, lines: f.text.split("\n"), language: f.language! }]),
  );
  const bodies = new Map<string, import("./body.ts").BuiltBody>();
  for (const symbol of graph.symbols.filter((s) => ["function", "method", "class"].includes(s.kind))) {
    const source = sources.get(graph.files.find((f) => f.id === symbol.fileId)?.path ?? "");
    if (!source) continue;
    const built = await bodyForSymbol(graph, symbol, source);
    if (built) bodies.set(symbol.id, built);
  }
  const world = generate(graph);
  const result = await buildEncounters(world, graph, (path) => sources.get(path) ?? null);
  return { graph, sources, bodies: bodies as Map<string, import("./body.ts").BuiltBody>, world, ...result };
}
