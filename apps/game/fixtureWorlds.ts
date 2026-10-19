import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type WorldModel, WorldModelSchema } from "@codebase-quest/shared";
import { generate, tiledMap } from "@codebase-quest/worldgen";
import type { Plugin } from "vite";
import { syntheticGraph } from "../../packages/worldgen/src/synthetic.ts";

/** Dev/test only: no fixture bytes or routes are included in production. */
export function fixtureWorlds(includeStress = false): Plugin {
  let files: Map<string, string | Buffer> | undefined;
  const make = () => {
    if (files) return files;
    files = new Map();
    const worlds: [string, WorldModel][] = [
      [
        "tiny-ts",
        WorldModelSchema.parse(
          JSON.parse(
            readFileSync(
              fileURLToPath(new URL("../../packages/worldgen/goldens/tiny-ts.world.json", import.meta.url)),
              "utf8",
            ),
          ),
        ),
      ],
    ];
    if (includeStress) worlds.push(["stress", generate(syntheticGraph(2000, 40, 50))]);
    for (const [name, world] of worlds) {
      if (name === "tiny-ts") world.kingdom.name = "Kingdom of Taskly";
      const prefix = `fixtures/${name}/`;
      files.set(`${prefix}world.json`, JSON.stringify(world));
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
  return {
    name: "fixture-worlds",
    configureServer(server) {
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
