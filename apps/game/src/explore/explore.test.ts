import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AbstractTileSchema, BiomeSchema } from "@codebase-quest/shared";
import { tiledMap } from "@codebase-quest/worldgen";
import { describe, expect, it } from "vitest";
import { assetUrl, validateWorld, WorldLoader } from "./loader.ts";
import { direction, findPath, move, visibleChunks, walkable } from "./navigation.ts";
import { required } from "./required.ts";
import { ExploreSession } from "./session.ts";

const golden = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../packages/worldgen/goldens/tiny-ts.world.json", import.meta.url)),
    "utf8",
  ),
);
const world = () => validateWorld(structuredClone(golden));
describe("exploration world loader", () => {
  it("accepts the generated world and maps every abstract tile in every biome", () => {
    const w = world();
    for (const biome of BiomeSchema.options)
      for (const tile of AbstractTileSchema.options) expect(w.theme.mapping[biome][tile]).toBeGreaterThanOrEqual(0);
    expect(w.kingdom.name).toBe("tiny-ts");
  });
  it("rejects malformed worlds, missing references, blocked transitions and invalid themes clearly", () => {
    expect(() => validateWorld({})).toThrow("Invalid world");
    let w = world();
    w.kingdom.gate.mapId = "missing";
    expect(() => validateWorld(w)).toThrow("Gate");
    w = world();
    required(w.transitions[0]).to.x = 100000;
    expect(() => validateWorld(w)).toThrow("transition");
    w = world();
    w.theme.mapping.port.wall = 999;
    expect(() => validateWorld(w)).toThrow("theme");
    w = world();
    required(w.maps[0]).collision = [];
    expect(() => validateWorld(w)).toThrow("dimensions");
  });
  it("confines world asset URLs to this local server", () => {
    for (const path of ["../secret", "https://example.com/a", "//example.com/a", "a\\b"])
      expect(() => assetUrl(path, "http://localhost/world/world.json")).toThrow();
    expect(assetUrl("maps/a.json", "http://localhost/world/world.json")).toBe("http://localhost/world/maps/a.json");
  });
  it("fetches Tiled maps lazily, checks collision/theme consistency, and retries failed loads", async () => {
    const w = world(),
      m = required(w.maps[0]);
    let calls = 0,
      broken = true;
    const request: typeof fetch = async () => {
      calls++;
      const data = tiledMap(w, m);
      if (broken) (data.layers[0] as { data: number[] }).data[0] = 999;
      return new Response(JSON.stringify(data));
    };
    const loader = new WorldLoader(w, "http://localhost/world/world.json", request);
    expect(calls).toBe(0);
    await expect(loader.map(m)).rejects.toThrow("Invalid Tiled");
    broken = false;
    await loader.map(m);
    await loader.map(m);
    expect(calls).toBe(2);
    const mismatch = tiledMap(w, m);
    (mismatch.layers[2] as { data: number[] }).data[0] = 0;
    const other = new WorldLoader(
      w,
      "http://localhost/world/world.json",
      async () => new Response(JSON.stringify(mismatch)),
    );
    if (m.collision[0]) await expect(other.map(m)).rejects.toThrow("disagrees");
  });
});
describe("walking, visibility and transitions", () => {
  it("normalizes diagonals and blocks high-speed tunneling", () => {
    expect(Math.hypot(...Object.values(direction(1, 1)))).toBeCloseTo(1);
    const w = world(),
      m = required(w.maps.find((m) => m.kind === "interior"));
    const p = required(w.interiors.find((i) => i.mapId === m.id)).entrance;
    const at = move(m, { x: (p.x + 0.5) * 16, y: (p.y + 0.5) * 16 }, { x: 10000, y: 0 }, 1);
    expect(walkable(m, Math.floor(at.x / 16), Math.floor(at.y / 16))).toBe(true);
    expect(at.x).toBeLessThan(m.width * 16 - 3);
  });
  it("paths only across unblocked cardinal neighbors and refuses blocked clicks", () => {
    const w = world(),
      s = new ExploreSession(w),
      m = s.map;
    const goal = required(w.regions[0]).entrance,
      path = findPath(m, w.kingdom.gate, goal);
    expect(path.length).toBeGreaterThan(0);
    let before = w.kingdom.gate;
    for (const p of path) {
      expect(walkable(m, p.x, p.y)).toBe(true);
      expect(Math.abs(p.x - before.x) + Math.abs(p.y - before.y)).toBe(1);
      before = { ...p, mapId: m.id };
    }
    expect(findPath(m, w.kingdom.gate, { x: -1, y: 0 })).toEqual([]);
  });
  it("keeps session fog across maps, recognizes reverse doors, and records only fully-seen buildings", () => {
    const w = world(),
      s = new ExploreSession(w),
      r = required(w.regions[0]);
    s.setPosition(w.kingdom.gate);
    const ratio = s.ratio();
    s.setPosition(r.spawn);
    const b = required(w.buildings.find((b) => b.regionId === r.id));
    s.setPosition(b.door);
    expect(s.nearbyTransition()?.to.mapId).toBe(required(w.interiors.find((i) => i.buildingId === b.id)).mapId);
    const interior = required(w.interiors.find((i) => i.buildingId === b.id));
    s.setPosition(interior.entrance);
    expect(s.nearbyTransition()?.to).toEqual(b.door);
    expect(s.breadcrumb.endsWith(b.label)).toBe(true);
    s.setPosition(w.kingdom.gate);
    expect(s.ratio()).toBe(ratio);
    s.setPosition(b.door);
    const fog = s.fog();
    fog.fill(1);
    s.reveal();
    expect(b.fileIds.every((id) => s.seenFiles.has(id))).toBe(true);
  });
  it("loads a bounded neighborhood of large-map chunks and changes it with the camera", () => {
    const a = visibleChunks(2000, 2000, { x: 0, y: 0, width: 960, height: 560 }),
      b = visibleChunks(2000, 2000, { x: 8000, y: 8000, width: 960, height: 560 });
    expect(a.length).toBeLessThanOrEqual(9);
    expect(b.length).toBeLessThanOrEqual(16);
    expect(a).not.toEqual(b);
  });
});
