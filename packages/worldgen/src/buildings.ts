import { posix } from "node:path";
import type { Building, CodeGraph, FileNode, Rect, Region, SymbolNode, WorldModel } from "@codebase-quest/shared";
import { astar, treemap } from "./geometry.ts";
import { compare, worldId } from "./random.ts";
import type { RegionChoice } from "./regions.ts";
import { border, line, makeMap, paint, rectangle } from "./tiles.ts";

export const sizeFor = (loc: number): Building["size"] =>
  loc < 50 ? "hut" : loc < 200 ? "house" : loc < 500 ? "manor" : "castle";
export function typeFor(file: FileNode): Building["type"] {
  if (/(?:^|\/)index\.[^.]+$|__init__\.py$/.test(file.path)) return "town-square";
  if (/(?:^|\/)README(?:\.[^/]*)?$/i.test(file.path)) return "library";
  if (/(?:^|\/)Dockerfile/.test(file.path)) return "harbor";
  return (
    (
      {
        test: "training-hall",
        docs: "library",
        manifest: "town-hall",
        config: "clocktower",
        ci: "watchtower",
        migration: "archive",
        generated: "statue",
      } as Partial<Record<FileNode["role"], Building["type"]>>
    )[file.role] ?? "house"
  );
}
export interface Lot {
  id: string;
  files: FileNode[];
  label: string;
}
interface DistrictPlan {
  path: string;
  lots: Lot[];
  bossLot: Lot | undefined;
}
export function hotspot(graph: CodeGraph, fileIds: Set<string>): SymbolNode | undefined {
  const files = new Map(graph.files.map((f) => [f.id, f]));
  return graph.symbols
    .filter((s) => fileIds.has(s.fileId) && ["function", "method"].includes(s.kind))
    .sort((a, b) => {
      const score = (s: SymbolNode) =>
        s.metrics.cyclomatic * Math.max(1, files.get(s.fileId)?.git?.churn ?? 0) * Math.max(1, s.metrics.fanIn);
      return score(b) - score(a) || compare(a.id, b.id);
    })[0];
}
function lotsFor(files: FileNode[]): Lot[] {
  const small = files.length > 40 ? files.filter((f) => f.loc < 30) : [];
  const ordinary = files
    .filter((f) => !small.includes(f))
    .map((file) => ({ id: worldId("building", file.id), files: [file], label: posix.basename(file.path) }));
  for (let i = 0; i < small.length; i += 8) {
    const group = small.slice(i, i + 8);
    ordinary.push({
      id: worldId("row-house", group.map((f) => f.id).join(":")),
      files: group,
      label: `Row house · ${group.length} files`,
    });
  }
  return ordinary.sort((a, b) => compare(a.id, b.id));
}
export function buildRegion(world: WorldModel, graph: CodeGraph, choice: RegionChoice, region: Region): void {
  const group = new Map<string, FileNode[]>();
  for (const file of choice.files) {
    const dir = posix.dirname(file.path);
    const list = group.get(dir) ?? [];
    list.push(file);
    group.set(dir, list);
  }
  const boss = hotspot(graph, new Set(choice.files.map((f) => f.id)));
  const plans: DistrictPlan[] = [...group]
    .sort(([a], [b]) => compare(a, b))
    .map(([path, files]) => {
      const lots = lotsFor(files);
      return { path, lots, bossLot: lots.find((l) => l.files.some((f) => f.id === boss?.fileId)) };
    });
  const totalLots = plans.reduce((n, p) => n + p.lots.length, 0);
  let width = Math.max(44, Math.ceil(Math.sqrt(Math.max(1, totalLots) * 168)) + 16),
    height = width;
  let bounds: Rect[] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    bounds = treemap(
      plans.map((p) => Math.max(6, p.lots.length + (p.bossLot ? 6 : 0))),
      { x: 4, y: 4, w: width - 8, h: height - 8 },
    );
    const fits = plans.every((p, i) => {
      const b = bounds[i];
      if (!b) return false;
      const columns = Math.floor((b.w - 4) / 14);
      const rows = columns > 0 ? Math.ceil((p.lots.length - (p.bossLot ? 1 : 0)) / columns) : Infinity;
      return b.w >= (p.bossLot ? 34 : 18) && b.h >= 4 + rows * 12 + (p.bossLot ? 24 : 0);
    });
    if (fits || !plans.length) break;
    width += 12;
    height += 12;
    if (attempt === 99) throw new Error("District treemap failed to allocate safe lots");
  }
  const map = makeMap(region.mapId, `maps/region-${region.id}.json`, "region", width, height, region.biome);
  border(map);
  world.maps.push(map);
  paint(map, region.spawn.x, region.spawn.y, "plaza");
  const reference = world.referenceDate ? Date.parse(world.referenceDate) : null;
  const testedFiles = new Set(
    graph.edges
      .filter((e) => e.kind === "tests" && e.confidence === "exact")
      .map((e) => graph.symbols.find((s) => s.id === e.to)?.fileId ?? e.to),
  );
  plans.forEach((plan, i) => {
    const box = bounds[i];
    if (!box) throw new Error("Missing district bounds");
    const districtId = worldId("district", `${region.id}:${plan.path}`);
    region.districtIds.push(districtId);
    world.districts.push({
      id: districtId,
      regionId: region.id,
      name: posix.basename(plan.path) === "." ? "Main district" : posix.basename(plan.path),
      path: plan.path,
      bounds: box,
    });
    const columns = Math.floor((box.w - 4) / 14);
    let ordinal = 0;
    for (const lot of plan.lots) {
      const isBoss = lot === plan.bossLot;
      const total = lot.files.reduce((sum, f) => sum + f.loc, 0);
      const size = sizeFor(total);
      const dimensions = { hut: [4, 4], house: [6, 5], manor: [8, 6], castle: [10, 7] }[size] ?? [4, 4];
      const x = isBoss ? box.x + 2 : box.x + 2 + (ordinal % columns) * 14;
      const y = isBoss ? box.y + 2 : box.y + 2 + (plan.bossLot ? 24 : 0) + Math.floor(ordinal / columns) * 12;
      if (!isBoss) ordinal++;
      const footprint = { x, y, w: dimensions[0] ?? 4, h: dimensions[1] ?? 4 };
      const door = { mapId: map.id, x: x + Math.floor(footprint.w / 2), y: y + footprint.h };
      rectangle(map, footprint, "wall", 1);
      paint(map, door.x, door.y, "door");
      const streetY = isBoss ? box.y + 21 : y + 10;
      line(map, box.x + 1, streetY, box.x + box.w - 2, streetY, "road");
      line(map, door.x, door.y, door.x, streetY, "path");
      line(map, box.x + 1, box.y + 1, box.x + 1, streetY, "road");
      const firstDates = lot.files.flatMap((f) => (f.git ? [Date.parse(f.git.firstCommitAt)] : []));
      const lastDates = lot.files.flatMap((f) => (f.git ? [Date.parse(f.git.lastCommitAt)] : []));
      const building: Building = {
        id: lot.id,
        regionId: region.id,
        districtId,
        fileIds: lot.files.map((f) => f.id),
        label: lot.label,
        size,
        type: lot.files.length > 1 ? "row-house" : typeFor(lot.files[0] as FileNode),
        bounds: footprint,
        door,
        interiorId: worldId("interior", lot.id),
        traits: {
          ageDays:
            reference !== null && firstDates.length
              ? Math.max(0, Math.floor((reference - Math.min(...firstDates)) / 86400000))
              : null,
          churn: lot.files.reduce((n, f) => n + (f.git?.churn ?? 0), 0),
          recentlyChanged:
            reference !== null && lastDates.length > 0 && reference - Math.max(...lastDates) <= 30 * 86400000,
          crackLevel: lot.files.reduce((n, f) => n + f.smellCount, 0),
          tested: lot.files.some((f) => testedFiles.has(f.id)),
        },
      };
      world.buildings.push(building);
      if (lot.files.length > 1)
        world.aggregation.push({ buildingId: building.id, fileIds: building.fileIds, reason: "small-files-row-house" });
      if (isBoss && boss) {
        const arena = { x: box.x + 16, y: box.y + 2, w: 12, h: 10 };
        rectangle(map, arena, "arena-floor");
        line(map, arena.x, arena.y + arena.h, arena.x, streetY);
        world.bosses.push({
          id: worldId("boss", boss.id),
          symbolId: boss.id,
          buildingId: building.id,
          regionId: region.id,
          arena: { mapId: map.id, bounds: arena },
        });
      }
      const landmarkType = (
        {
          "town-square": "plaza",
          library: "library",
          "town-hall": "town-hall",
          watchtower: "watchtower",
          harbor: "harbor",
          clocktower: "clocktower",
        } as const
      )[building.type as "town-square"];
      if (landmarkType)
        world.landmarks.push({
          id: worldId("landmark:building", building.id),
          type: landmarkType,
          label: building.label,
          position: door,
        });
    }
  });
  for (const district of world.districts.filter((d) => d.regionId === region.id))
    for (const point of astar(map, region.spawn, { x: district.bounds.x + 1, y: district.bounds.y + 1 }))
      paint(map, point.x, point.y, "road");
  world.transitions.push({
    id: worldId("transition:region", region.id),
    kind: "region",
    from: region.entrance,
    to: region.spawn,
    label: region.name,
  });
}
