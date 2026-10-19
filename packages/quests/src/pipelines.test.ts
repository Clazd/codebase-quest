import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { discover } from "../../analyzer/src/discover.ts";
import { analyze } from "../../analyzer/src/index.ts";
import { buildFactBook } from "../../content/src/facts.ts";
import { generate } from "../../worldgen/src/index.ts";
import { generateQuests } from "./generate.ts";

it("generates a proven local middleware escort in source registration order", async () => {
  const root = fileURLToPath(new URL("../fixtures/pipelines", import.meta.url));
  const graph = await analyze(root),
    world = generate(graph),
    sources = discover(root).files;
  const atlas = await generateQuests(
    world,
    graph,
    buildFactBook(graph, world),
    (path) => {
      const source = sources.find((f) => f.path === path);
      return source?.language ? { text: source.text, language: source.language } : null;
    },
    [],
  );
  const escorts = atlas.quests.filter((q) => q.type === "escort");
  const rawSource = sources.find((f) => f.path === "src/index.ts")?.text ?? "";
  for (const s of atlas.symbols) {
    const parameters = new RegExp(`function ${s.name}\\(([^)]*)\\)`).exec(rawSource)?.[1] ?? "";
    expect(s.parameters).toBe(parameters.trim() ? parameters.split(",").length : 0);
    if (s.callOrder.length) expect(atlas.symbols.find((n) => n.id === s.callOrder[0])?.name).toBe("parseTask");
  }
  expect(escorts).toHaveLength(1);
  expect(escorts[0]?.path.map((id) => atlas.symbols.find((s) => s.id === id)?.name)).toEqual([
    "authenticate",
    "authorize",
    "respond",
  ]);
  const deliveries = atlas.quests.filter((q) => q.type === "delivery");
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]?.path.map((id) => atlas.symbols.find((s) => s.id === id)?.name)).toEqual([
    "parseTask",
    "saveTask",
  ]);
  expect({ deliveries: atlas.deliveries, quests: [...deliveries, ...escorts] }).toMatchSnapshot();
  const stale = await generateQuests(
    world,
    graph,
    buildFactBook(graph, world),
    (path) => {
      const file = sources.find((f) => f.path === path);
      return file?.language
        ? {
            text: file.text.replace("const task = parseTask();", "const task = unknownAlias();"),
            language: file.language,
          }
        : null;
    },
    [],
  );
  expect(stale.symbols.find((s) => s.name === "forward")?.callOrder).toEqual([]);
  // The proof is the raw source argument list, independently of generator resolution.
  expect(sources.find((f) => f.path === "src/index.ts")?.text).toContain(
    "router.use(authenticate, authorize, respond)",
  );
});
