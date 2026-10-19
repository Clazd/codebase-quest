import { type WorldMap, type WorldModel, WorldModelSchema } from "@codebase-quest/shared";
import { TiledMapSchema } from "../../../../packages/worldgen/src/tiledSchema.ts";
import { required } from "./required.ts";

export type TiledMap = ReturnType<typeof TiledMapSchema.parse>;
export function assetUrl(path: string, base: string): string {
  if (
    !path ||
    path.includes("\\") ||
    path.split("/").some((p) => p === ".." || p === ".") ||
    /^[a-z]+:|^\/\//i.test(path)
  )
    throw new Error(`Unsafe world asset path: ${path}`);
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin) throw new Error("World assets must be local to this server");
  return url.href;
}
export function validateWorld(data: unknown): WorldModel {
  const result = WorldModelSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      `Invalid world: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 4)
        .join("; ")}`,
    );
  const w = result.data;
  const maps = new Map(w.maps.map((m) => [m.id, m]));
  if (maps.size !== w.maps.length) throw new Error("Invalid world: duplicate map IDs");
  const validPosition = (p: { mapId: string; x: number; y: number }) => {
    const m = maps.get(p.mapId);
    return m && p.x < m.width && p.y < m.height && m.collision[p.y * m.width + p.x] === 0;
  };
  if (!maps.has(w.kingdom.overworldMap) || !validPosition(w.kingdom.gate))
    throw new Error("Invalid world: Gate/map reference");
  const regions = new Set(w.regions.map((r) => r.id)),
    buildings = new Set(w.buildings.map((b) => b.id)),
    interiors = new Set(w.interiors.map((i) => i.id));
  for (const r of w.regions)
    if (maps.get(r.mapId)?.kind !== "region" || !validPosition(r.entrance) || !validPosition(r.spawn))
      throw new Error(`Invalid world: region ${r.id}`);
  for (const b of w.buildings)
    if (!regions.has(b.regionId) || !interiors.has(b.interiorId) || !validPosition(b.door))
      throw new Error(`Invalid world: building ${b.id}`);
  for (const i of w.interiors)
    if (!buildings.has(i.buildingId) || maps.get(i.mapId)?.kind !== "interior" || !validPosition(i.entrance))
      throw new Error(`Invalid world: interior ${i.id}`);
  for (const n of w.npcs)
    if (!buildings.has(n.buildingId) || !validPosition(n.position) || (n.outdoor && !validPosition(n.outdoor)))
      throw new Error(`Invalid world: NPC ${n.id}`);
  for (const t of w.transitions)
    if (!validPosition(t.from) || !validPosition(t.to)) throw new Error(`Invalid world: transition ${t.id}`);
  for (const m of w.maps) assetUrl(m.path, "http://localhost/world/world.json");
  assetUrl(w.theme.image, "http://localhost/world/world.json");
  for (const mapping of Object.values(w.theme.mapping))
    for (const gid of Object.values(mapping))
      if (gid > w.theme.tileCount) throw new Error("Invalid world: theme GID outside tileset");
  return w;
}
export class WorldLoader {
  private readonly maps = new Map<string, Promise<TiledMap>>();
  readonly world: WorldModel;
  readonly url: string;
  private readonly request: typeof fetch;
  constructor(world: WorldModel, url: string, request: typeof fetch = fetch) {
    this.world = world;
    this.url = url;
    this.request = (...args) => request(...args);
  }
  static async open(url: string, request: typeof fetch = fetch): Promise<WorldLoader> {
    const response = await request(url);
    if (!response.ok) throw new Error(`World request failed (${response.status})`);
    return new WorldLoader(validateWorld(await response.json()), response.url || url, request);
  }
  async map(map: WorldMap): Promise<TiledMap> {
    let pending = this.maps.get(map.id);
    if (!pending) {
      pending = (async () => {
        const response = await this.request(assetUrl(map.path, this.url));
        if (!response.ok) throw new Error(`Map ${map.id} request failed (${response.status})`);
        const parsed = TiledMapSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error(`Invalid Tiled map ${map.id}: ${parsed.error.issues[0]?.message}`);
        const tiled = parsed.data;
        if (tiled.width !== map.width || tiled.height !== map.height)
          throw new Error(`Map ${map.id} dimensions disagree with world`);
        for (const name of ["ground", "decor", "collision"]) {
          const layer = tiled.layers.find((l) => l.name === name);
          if (
            layer?.type !== "tilelayer" ||
            layer.data.some((gid, i) =>
              name === "collision"
                ? Boolean(gid) !== Boolean(map.collision[i])
                : gid !==
                  this.world.theme.mapping[map.biome][required(name === "ground" ? map.ground[i] : map.decor[i])],
            )
          )
            throw new Error(`Map ${map.id} ${name} layer disagrees with world/theme`);
        }
        return tiled;
      })();
      this.maps.set(map.id, pending);
      pending.catch(() => this.maps.delete(map.id));
      // Limit retained Tiled JSON; logical collision/fog remains in the session.
      if (this.maps.size > 4) this.maps.delete(required(this.maps.keys().next().value));
    }
    return pending;
  }
}
