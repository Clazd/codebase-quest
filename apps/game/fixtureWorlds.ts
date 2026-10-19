import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { buildSearchIndex } from "@codebase-quest/content";
import { buildFactBook } from "@codebase-quest/content/facts";
import { type CodeGraph, CodeGraphSchema, type WorldModel, WorldModelSchema } from "@codebase-quest/shared";
import { generate, tiledMap } from "@codebase-quest/worldgen";
import type { Plugin } from "vite";
import { createSourceReader, sourceResponse } from "../../apps/cli/src/source.ts";
import { syntheticGraph } from "../../packages/worldgen/src/synthetic.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
/** The built Taskly fixture repository (`pnpm fixtures`); its source lines back the Code Panel in tests. */
const TINY_TS = here("../../fixtures/repos/tiny-ts");

/** Dev/test only: no fixture bytes or routes are included in production. */
export function fixtureWorlds(includeStress = false): Plugin {
  let files: Map<string, string | Buffer> | undefined;
  const make = () => {
    if (files) return files;
    files = new Map();
    const tinyGraph = CodeGraphSchema.parse(
      JSON.parse(readFileSync(here("../../packages/analyzer/goldens/tiny-ts.graph.json"), "utf8")),
    );
    const worlds: [string, WorldModel, CodeGraph][] = [
      [
        "tiny-ts",
        WorldModelSchema.parse(
          JSON.parse(readFileSync(here("../../packages/worldgen/goldens/tiny-ts.world.json"), "utf8")),
        ),
        tinyGraph,
      ],
    ];
    if (includeStress) {
      const graph = syntheticGraph(2000, 40, 50);
      worlds.push(["stress", generate(graph), graph]);
    }
    for (const [name, world, graph] of worlds) {
      if (name === "tiny-ts") world.kingdom.name = "Kingdom of Taskly";
      const prefix = `fixtures/${name}/`;
      files.set(`${prefix}world.json`, JSON.stringify(world));
      const facts = buildFactBook(graph, world);
      files.set(
        `${prefix}facts.json`,
        JSON.stringify({
          ...facts,
          links:
            name === "tiny-ts"
              ? { root: TINY_TS.replaceAll("\\", "/"), github: null, editor: "vscode://file/{path}:{line}" }
              : null,
        }),
      );
      files.set(
        `${prefix}${world.theme.image}`,
        readFileSync(
          fileURLToPath(new URL("../../packages/assets/kenney/tiny-dungeon/tilemap_packed.png", import.meta.url)),
        ),
      );
      for (const map of world.maps)
        if (name !== "stress" || map.kind !== "interior")
          files.set(`${prefix}${map.path}`, JSON.stringify(tiledMap(world, map)));
    }
    return files;
  };
  let read: ReturnType<typeof createSourceReader> | undefined;
  let searchJson: string | undefined;
  const tinyFacts = () =>
    buildFactBook(
      CodeGraphSchema.parse(
        JSON.parse(readFileSync(here("../../packages/analyzer/goldens/tiny-ts.graph.json"), "utf8")),
      ),
      WorldModelSchema.parse(
        JSON.parse(readFileSync(here("../../packages/worldgen/goldens/tiny-ts.world.json"), "utf8")),
      ),
    );
  /** `fixtures/tiny-ts/source/<fileId>?start&end`: the same safe reader as `cq play`. */
  const source = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const [path = "", search = ""] = (req.url ?? "").split("?");
    const isSearch = path === "/fixtures/tiny-ts/search.json";
    if (!path.startsWith("/fixtures/tiny-ts/source/") && !isSearch) return next();
    try {
      read ??= createSourceReader(
        TINY_TS,
        CodeGraphSchema.parse(
          JSON.parse(readFileSync(here("../../packages/analyzer/goldens/tiny-ts.graph.json"), "utf8")),
        ).files,
      );
      if (isSearch) {
        // The same BM25 index `cq play` ships, built from the real fixture lines (masked).
        const reader = read;
        searchJson ??= JSON.stringify(
          buildSearchIndex(tinyFacts(), (sheet) => {
            const r = reader(sheet.fileId, sheet.range.startLine, sheet.range.endLine);
            return r.status === 200 ? r.body.lines : null;
          }),
        );
        res.setHeader("Content-Type", "application/json");
        res.end(searchJson);
        return;
      }
      const result = sourceResponse(read, path.slice("/fixtures/tiny-ts/source/".length), search);
      res.statusCode = result.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result.body));
    } catch {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Run `pnpm fixtures` to build fixtures/repos/tiny-ts" }));
    }
  };
  return {
    name: "fixture-worlds",
    configurePreviewServer(server) {
      server.middlewares.use(source);
    },
    configureServer(server) {
      server.middlewares.use(source);
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").slice(1).split("?")[0] ?? "";
        if (!path.startsWith("fixtures/")) return next();
        const file = make().get(path);
        if (!file) return next();
        res.setHeader("Content-Type", path.endsWith(".png") ? "image/png" : "application/json");
        res.end(file);
      });
    },
    generateBundle() {
      for (const [fileName, source] of make()) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
