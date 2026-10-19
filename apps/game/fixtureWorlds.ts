import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { buildSearchIndex } from "@codebase-quest/content";
import { buildFactBook } from "@codebase-quest/content/facts";
import { type CodeGraph, CodeGraphSchema, type WorldModel, WorldModelSchema } from "@codebase-quest/shared";
import { generate, tiledMap } from "@codebase-quest/worldgen";
import type { Plugin } from "vite";
import { createSourceReader, maskLines, sourceResponse } from "../../apps/cli/src/source.ts";
import { syntheticGraph } from "../../packages/worldgen/src/synthetic.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const graphOf = (name: string) =>
  CodeGraphSchema.parse(JSON.parse(readFileSync(here(`../../packages/analyzer/goldens/${name}.graph.json`), "utf8")));
/** Fixtures backed by a real repository (`pnpm fixtures`): Code Panel lines, search and fights come from it. */
const REAL: Record<string, { world: () => WorldModel; title: string }> = {
  "tiny-ts": {
    world: () =>
      WorldModelSchema.parse(
        JSON.parse(readFileSync(here("../../packages/worldgen/goldens/tiny-ts.world.json"), "utf8")),
      ),
    title: "Kingdom of Taskly",
  },
  "smelly-ts": { world: () => generate(graphOf("smelly-ts")), title: "Kingdom of Shop" },
};
const repoOf = (name: string) => here(`../../fixtures/repos/${name}`);

/** Dev/test only: no fixture bytes or routes are included in production. */
export function fixtureWorlds(includeStress = false): Plugin {
  let files: Map<string, string | Buffer> | undefined;
  const worlds = new Map<string, WorldModel>();
  const worldOf = (name: string) => {
    let w = worlds.get(name);
    if (!w) {
      w = (REAL[name] as (typeof REAL)[string]).world();
      w.kingdom.name = (REAL[name] as (typeof REAL)[string]).title;
      worlds.set(name, w);
    }
    return w;
  };
  const make = () => {
    if (files) return files;
    files = new Map();
    const list: [string, WorldModel, CodeGraph][] = Object.keys(REAL).map((name) => [
      name,
      worldOf(name),
      graphOf(name),
    ]);
    if (includeStress) {
      const graph = syntheticGraph(2000, 40, 50);
      list.push(["stress", generate(graph), graph]);
    }
    for (const [name, world, graph] of list) {
      const prefix = `fixtures/${name}/`;
      files.set(`${prefix}world.json`, JSON.stringify(world));
      const facts = buildFactBook(graph, world);
      const real = name in REAL;
      files.set(
        `${prefix}facts.json`,
        JSON.stringify({
          ...facts,
          links: real
            ? { root: repoOf(name).replaceAll("\\", "/"), github: null, editor: "vscode://file/{path}:{line}" }
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
  const readers = new Map<string, ReturnType<typeof createSourceReader>>();
  const lazy = new Map<string, Promise<string>>();
  const readerOf = (name: string) => {
    let r = readers.get(name);
    if (!r) {
      r = createSourceReader(repoOf(name), graphOf(name).files);
      readers.set(name, r);
    }
    return r;
  };
  /** Built on first request from the real fixture files (masked), exactly like `cq play`. */
  async function lazyFile(name: string, file: string): Promise<string | null> {
    const key = `${name}/${file}`;
    if (file === "search.json" || file.startsWith("encounters/")) {
      let pending = lazy.get(file === "search.json" ? key : `${name}/encounters`);
      if (!pending) {
        if (file === "search.json") {
          const reader = readerOf(name);
          pending = Promise.resolve(
            JSON.stringify(
              buildSearchIndex(buildFactBook(graphOf(name), worldOf(name)), (sheet) => {
                const r = reader(sheet.fileId, sheet.range.startLine, sheet.range.endLine);
                return r.status === 200 ? r.body.lines : null;
              }),
            ),
          );
          lazy.set(key, pending);
        } else {
          const { buildEncounters } = await import("@codebase-quest/puzzles");
          pending = buildEncounters(worldOf(name), graphOf(name), (path) => {
            const full = `${repoOf(name)}/${path}`;
            if (!existsSync(full)) return null;
            const text = maskLines(readFileSync(full, "utf8").replaceAll("\r\n", "\n").split("\n")).lines.join("\n");
            return {
              text,
              language: path.endsWith(".py") ? "python" : path.endsWith(".js") ? "javascript" : "typescript",
            };
          }).then((built) =>
            JSON.stringify({
              index: built.index,
              encounters: Object.fromEntries(built.encounters),
            }),
          );
          lazy.set(`${name}/encounters`, pending);
        }
      }
      const text = await pending;
      if (file === "search.json") return text;
      const all = JSON.parse(text) as { index: unknown; encounters: Record<string, unknown> };
      if (file === "encounters/index.json") return JSON.stringify(all.index);
      const id = file.slice("encounters/".length).replace(/\.json$/, "");
      return all.encounters[id] ? JSON.stringify(all.encounters[id]) : null;
    }
    return null;
  }
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const [path = "", search = ""] = (req.url ?? "").split("?");
    const match = /^\/fixtures\/(tiny-ts|smelly-ts)\/(.+)$/.exec(path);
    if (!match) return next();
    const [, name = "", file = ""] = match;
    const json = (status: number, body: string) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(body);
    };
    if (file.startsWith("source/")) {
      try {
        const result = sourceResponse(readerOf(name), file.slice("source/".length), search);
        json(result.status, JSON.stringify(result.body));
      } catch {
        json(503, JSON.stringify({ error: "Run `pnpm fixtures` to build fixtures/repos/" }));
      }
      return;
    }
    if (file !== "search.json" && !file.startsWith("encounters/")) return next();
    lazyFile(name, file)
      .then((body) => (body ? json(200, body) : json(404, "{}")))
      .catch(() => json(503, JSON.stringify({ error: "Run `pnpm fixtures` to build fixtures/repos/" })));
  };
  return {
    name: "fixture-worlds",
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    configureServer(server) {
      server.middlewares.use(middleware);
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
