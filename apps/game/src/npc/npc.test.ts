import { readFileSync } from "node:fs";
import { FactBookSchema, type FactSheet, WorldModelSchema } from "@codebase-quest/shared";
import { describe, expect, it } from "vitest";
import { walkable } from "../explore/navigation.ts";
import { required } from "../explore/required.ts";
import { EventBus } from "../overlay/bus.ts";
import { badgesFor, baseFrame, behaviorFor, FRAMES, hasVisitors, tintFor } from "./appearance.ts";
import { CodexStore, codexKey, completion, exportNotes, searchCodex } from "./codex.ts";
import { FactIndex, safeEditorTemplate } from "./facts.ts";
import { hops, mapGraph, nearestSpot, nextWaypoint, standBeside } from "./guide.ts";
import { layoutNpcs } from "./layout.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const world = WorldModelSchema.parse(read("../../../../packages/worldgen/goldens/tiny-ts.world.json"));
const book = FactBookSchema.parse(read("../../../../packages/content/goldens/tiny-ts.facts.json"));
const sheet = (name: string) => required(book.symbols.find((s) => s.name === name));
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("appearance", () => {
  const with_ = (overrides: Partial<FactSheet>) => ({ ...sheet("slugify"), ...overrides });
  it("chooses bodies, badges, tints and idle behaviors from facts", () => {
    expect(baseFrame(sheet("slugify"))).toBe(FRAMES.function);
    expect(baseFrame(with_({ kind: "class" }))).toBe(FRAMES.class);
    expect(baseFrame(with_({ traits: ["test"] }))).toBe(FRAMES.trainer);
    expect(baseFrame(with_({ traits: ["deprecated"] }))).toBe(FRAMES.ghost);
    expect(badgesFor(with_({ async: true, traits: ["does-io", "recursive"] }))).toEqual([
      "async",
      "recursive",
      "does-io",
    ]);
    expect(behaviorFor(with_({ async: true, traits: ["does-io"] }))).toBe("brisk");
    expect(behaviorFor(with_({ traits: ["does-io"] }))).toBe("busy");
    expect(behaviorFor(with_({ traits: ["pure-candidate"] }))).toBe("meditate");
    expect(behaviorFor(with_({ traits: [], metrics: { ...sheet("slugify").metrics, fanIn: 0 } }))).toBe("alone");
    expect(behaviorFor(with_({ kind: "type" }))).toBe("stand");
    expect(hasVisitors(with_({ metrics: { ...sheet("slugify").metrics, fanIn: 5 } }))).toBe(true);
    // Methods share their class's guild color.
    const a = with_({ group: { kind: "class", key: "C1", label: "C" } }),
      b = with_({ name: "other", group: { kind: "class", key: "C1", label: "C" } });
    expect(tintFor(a)).toBe(tintFor(b));
  });
});
describe("crowd layout", () => {
  it("gives every character its own walkable tile near its WorldModel spot, deterministically", () => {
    for (const map of world.maps) {
      const spots = layoutNpcs(world, map);
      expect(layoutNpcs(world, map)).toEqual(spots);
      const expected = world.npcs.flatMap((n) => [n.position, n.outdoor].filter((p) => p?.mapId === map.id));
      expect(spots).toHaveLength(expected.length);
      for (const s of spots) expect(walkable(map, s.x, s.y)).toBe(true);
      expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(spots.length);
      for (const s of spots) {
        const npc = required(world.npcs.find((n) => n.id === s.npcId));
        const home = required(s.outdoor ? npc.outdoor : npc.position);
        expect(Math.max(Math.abs(home.x - s.x), Math.abs(home.y - s.y))).toBeLessThanOrEqual(3);
      }
    }
  });
});
describe("guide", () => {
  const graph = mapGraph(world);
  const saveTask = required(world.npcs.find((n) => n.symbolId === sheet("saveTask").symbolId));
  const interior = required(world.interiors.find((i) => i.buildingId === saveTask.buildingId));
  const building = required(world.buildings.find((b) => b.id === saveTask.buildingId));
  it("routes through gates and doors to another map", () => {
    expect(hops(graph, "overworld", saveTask.position.mapId)).toBe(2);
    const fromOverworld = required(nextWaypoint(graph, world.kingdom.gate, saveTask.position));
    const gate = required(world.transitions.find((t) => t.kind === "region" && t.to.mapId === building.door.mapId));
    expect(fromOverworld.position).toEqual(gate.from);
    const inRegion = required(nextWaypoint(graph, { ...building.door, x: building.door.x }, saveTask.position));
    expect(inRegion.position).toEqual(building.door);
    expect(nextWaypoint(graph, interior.entrance, saveTask.position)?.position).toEqual(saveTask.position);
    // Leaving: from inside a building toward another region, the first step is the exit.
    const other = required(world.npcs.find((n) => n.symbolId === sheet("slugify").symbolId));
    expect(nextWaypoint(graph, interior.entrance, other.position)?.position).toEqual(interior.entrance);
  });
  it("prefers the outdoor spot of exported characters when it is closer", () => {
    const slug = required(world.npcs.find((n) => n.symbolId === sheet("slugify").symbolId));
    expect(nearestSpot(graph, slug, world.kingdom.gate)).toEqual(slug.outdoor);
    expect(nearestSpot(graph, slug, slug.position)).toEqual(slug.position);
    const map = required(world.maps.find((m) => m.id === slug.position.mapId));
    const beside = standBeside(map, slug.position);
    expect(walkable(map, beside.x, beside.y)).toBe(true);
    expect(Math.abs(beside.x - slug.position.x) + Math.abs(beside.y - slug.position.y)).toBeGreaterThan(0);
  });
});
describe("Codex store", () => {
  it("persists read entries and notes under a versioned key and ignores bad data", () => {
    const storage = memory(),
      key = codexKey("tiny-ts", "abc");
    expect(key).toBe("cq:codex:tiny-ts:abc");
    expect(codexKey("x", null)).toBe("cq:codex:x:unversioned");
    const store = new CodexStore(storage, key);
    expect(store.markRead("aaaaaaaaaaaa")).toBe(true);
    expect(store.markRead("aaaaaaaaaaaa")).toBe(false);
    store.setNote("aaaaaaaaaaaa", "Note **one**");
    const again = new CodexStore(storage, key);
    expect(again.count).toBe(1);
    expect(again.note("aaaaaaaaaaaa")).toBe("Note **one**");
    expect(JSON.parse(required(storage.data.get(key))).version).toBe(1);
    storage.setItem(key, JSON.stringify({ version: 99, entries: {} }));
    expect(new CodexStore(storage, key).count).toBe(0);
    storage.setItem(key, "{not json");
    expect(new CodexStore(storage, key).count).toBe(0);
    const full = new CodexStore(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      key,
    );
    full.markRead("bbbbbbbbbbbb");
    expect(full.persistent).toBe(false);
    expect(full.count).toBe(1);
  });
  it("searches, filters, computes completion and exports notes", () => {
    const store = new CodexStore(memory(), "k");
    const characters = book.symbols.filter((s) => s.npcId);
    for (const name of ["slugify", "formatDate", "saveTask"]) store.markRead(sheet(name).symbolId);
    const isRead = (id: string) => store.has(id);
    const none = { query: "", regionId: "", kind: "", trait: "" };
    expect(searchCodex(characters, isRead, none).map((s) => s.name)).toEqual(["formatDate", "saveTask", "slugify"]);
    expect(searchCodex(characters, isRead, { ...none, query: "format" }).map((s) => s.name)).toEqual(["formatDate"]);
    expect(searchCodex(characters, isRead, { ...none, query: "src/db" }).map((s) => s.name)).toEqual(["saveTask"]);
    expect(searchCodex(characters, isRead, { ...none, trait: "does-io" }).map((s) => s.name)).toEqual(["saveTask"]);
    expect(
      searchCodex(characters, isRead, { ...none, regionId: required(sheet("slugify").regionId) }).map((s) => s.name),
    ).toEqual(["formatDate", "slugify"]);
    const done = completion(characters, isRead, world.regions);
    expect(done.overall).toEqual({ read: 3, total: characters.length, percent: Math.floor(300 / characters.length) });
    expect(done.regions.reduce((n, r) => n + r.total, 0)).toBe(characters.length);
    store.setNote(sheet("slugify").symbolId, "Used for task URLs.");
    const markdown = exportNotes("Kingdom of Taskly", store, characters);
    expect(markdown).toContain("# Kingdom of Taskly: Codex notes");
    expect(markdown).toContain("## slugify()\n\n`src/utils/slugify.ts:2-8` · function\n\nUsed for task URLs.");
    expect(markdown).not.toContain("formatDate");
  });
});
describe("fact index links", () => {
  const index = (links: (typeof book)["links"]) => new FactIndex({ ...book, links }, world, "http://localhost/world/");
  it("builds editor and GitHub URLs only from safe templates and remotes", () => {
    const local = index({
      root: "C:/Users/me/My Repo",
      github: "https://github.com/acme/taskly",
      editor: "vscode://file/{path}:{line}",
    });
    expect(local.editorUrl(sheet("slugify"))).toBe("vscode://file/C:/Users/me/My%20Repo/src/utils/slugify.ts:2");
    expect(local.githubUrl(sheet("slugify"))).toBe(
      `https://github.com/acme/taskly/blob/${book.repo.commit}/src/utils/slugify.ts#L2-L8`,
    );
    expect(index(null).editorUrl(sheet("slugify"))).toBeNull();
    expect(
      index({ root: "/r", github: "https://evil.example/x", editor: "javascript:alert(1)" }).editorUrl(
        sheet("slugify"),
      ),
    ).toBeNull();
    expect(
      index({ root: "/r", github: "https://evil.example/x", editor: "x://{path}" }).githubUrl(sheet("slugify")),
    ).toBeNull();
    expect(safeEditorTemplate("idea://open?file={path}&line={line}")).toBe(true);
    expect(safeEditorTemplate("https://example.com/{path}")).toBe(false);
  });
  it("fetches only a symbol's line range and caches it", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          fileId: "f",
          path: "p",
          startLine: 2,
          endLine: 8,
          totalLines: 9,
          lines: [],
          masked: [],
          stale: false,
        }),
      );
    }) as typeof fetch;
    const facts = new FactIndex(book, world, "http://localhost/world/world.json", fake);
    await facts.source(sheet("slugify"));
    await facts.source(sheet("slugify"));
    expect(urls).toEqual([`http://localhost/world/source/${sheet("slugify").fileId}?start=2&end=8`]);
  });
});
describe("event bus", () => {
  it("delivers typed events and unsubscribes", () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    const seen: number[] = [];
    const off = bus.on("ping", ({ n }) => seen.push(n));
    bus.emit("ping", { n: 1 });
    off();
    bus.emit("ping", { n: 2 });
    expect(seen).toEqual([1]);
  });
});
