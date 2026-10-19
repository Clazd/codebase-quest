import type { WorldModel, WorldPosition } from "@codebase-quest/shared";
import { walkable } from "./navigation.ts";
import { required } from "./required.ts";
export class ExploreSession {
  readonly seen = new Map<string, Uint8Array>();
  readonly seenFiles = new Set<string>();
  readonly maps;
  private readonly regionByMap;
  private readonly buildingByMap;
  position: WorldPosition;
  readonly world: WorldModel;
  constructor(world: WorldModel) {
    this.world = world;
    this.maps = new Map(world.maps.map((m) => [m.id, m]));
    this.position = { ...world.kingdom.gate };
    const regions = new Map(world.regions.map((r) => [r.id, r])),
      buildings = new Map(world.buildings.map((b) => [b.id, b]));
    this.regionByMap = new Map(world.regions.map((r) => [r.mapId, r]));
    this.buildingByMap = new Map(
      world.interiors.flatMap((i) => {
        const b = buildings.get(i.buildingId);
        return b ? [[i.mapId, b] as const] : [];
      }),
    );
    for (const [mapId, b] of this.buildingByMap) {
      const r = regions.get(b.regionId);
      if (r) this.regionByMap.set(mapId, r);
    }
  }
  get map() {
    return required(this.maps.get(this.position.mapId));
  }
  get region() {
    return this.regionByMap.get(this.map.id);
  }
  get building() {
    return this.buildingByMap.get(this.map.id);
  }
  get breadcrumb() {
    const region = this.region,
      building = this.building;
    const district = building
      ? this.world.districts.find((d) => d.id === building.districtId)
      : this.world.districts.find(
          (d) =>
            d.regionId === region?.id &&
            this.position.x >= d.bounds.x &&
            this.position.x < d.bounds.x + d.bounds.w &&
            this.position.y >= d.bounds.y &&
            this.position.y < d.bounds.y + d.bounds.h,
        );
    const path = district?.path || region?.path;
    return [this.world.kingdom.name.replace(/^Kingdom of /, ""), path, building?.label].filter(Boolean).join(" / ");
  }
  fog(mapId = this.map.id) {
    let fog = this.seen.get(mapId);
    if (!fog) {
      const m = required(this.maps.get(mapId));
      fog = new Uint8Array(m.width * m.height);
      this.seen.set(mapId, fog);
    }
    return fog;
  }
  reveal() {
    const map = this.map,
      fog = this.fog();
    const { x, y } = this.position;
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++)
        if (dx * dx + dy * dy <= 64 && x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height)
          fog[(y + dy) * map.width + x + dx] = 1;
    for (const b of this.world.buildings)
      if (b.door.mapId === map.id && !b.fileIds.every((id) => this.seenFiles.has(id))) {
        let full = true;
        for (let by = b.bounds.y; by < b.bounds.y + b.bounds.h && full; by++)
          for (let bx = b.bounds.x; bx < b.bounds.x + b.bounds.w; bx++)
            if (!fog[by * map.width + bx]) {
              full = false;
              break;
            }
        if (full) for (const id of b.fileIds) this.seenFiles.add(id);
      }
  }
  ratio() {
    const fog = this.fog();
    return fog.reduce((a, b) => a + b, 0) / fog.length;
  }
  setPosition(p: WorldPosition) {
    const m = this.maps.get(p.mapId);
    if (!m || !walkable(m, p.x, p.y)) throw new Error("Destination is blocked or outside the map");
    this.position = { ...p };
    this.reveal();
  }
  nearbyTransition() {
    return this.world.transitions
      .flatMap((t) => [
        { id: t.id, label: t.label, from: t.from, to: t.to },
        { id: t.id, label: `Exit ${t.label}`, from: t.to, to: t.from },
      ])
      .filter(
        (t) =>
          t.from.mapId === this.map.id && Math.hypot(t.from.x - this.position.x, t.from.y - this.position.y) <= 1.5,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.from.x - this.position.x, a.from.y - this.position.y) -
          Math.hypot(b.from.x - this.position.x, b.from.y - this.position.y),
      )[0];
  }
}
