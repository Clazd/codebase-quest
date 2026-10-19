import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorldMap, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { WorldModelSchema } from "@codebase-quest/shared";
import { tileColor } from "./tiles.ts";

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
interface Marker {
  id: string;
  type: string;
  label: string;
  position: WorldPosition;
  properties?: Record<string, string | number | boolean>;
}
export function markers(world: WorldModel, mapId: string): Marker[] {
  const markers: Marker[] = [
    ...world.buildings.map((b) => ({
      id: b.id,
      type: "building",
      label: b.label,
      position: b.door,
      properties: { fileIds: b.fileIds.join(","), interiorId: b.interiorId },
    })),
    ...world.npcs.flatMap((n) => [
      {
        id: n.id,
        type: "npc",
        label: n.symbolId,
        position: n.position,
        properties: { symbolId: n.symbolId, crowdId: n.crowdId ?? "" },
      },
      ...(n.outdoor
        ? [
            {
              id: `outdoor-${n.id}`,
              type: "npc-outdoor",
              label: n.symbolId,
              position: n.outdoor,
              properties: { symbolId: n.symbolId, crowdId: n.crowdId ?? "" },
            },
          ]
        : []),
    ]),
    ...world.monsters.map((m) => ({
      id: m.id,
      type: "monster",
      label: `${m.kind === "todo-comment" ? "Gremlin" : m.kind} · level ${m.level}`,
      position: m.position,
      properties: { smellId: m.smellId, level: m.level, patrolRadius: m.patrolRadius },
    })),
    ...world.portals.map((p) => ({
      id: p.id,
      type: "portal",
      label: p.label,
      position: p.position,
      properties: { entryPointId: p.entryPointId },
    })),
    ...world.dungeons.map((d) => ({
      id: d.id,
      type: "dungeon",
      label: "Call-stack dungeon",
      position: d.position,
      properties: { chain: d.chainSymbolIds.join(",") },
    })),
    ...world.landmarks.map((l) => ({ id: l.id, type: l.type, label: l.label, position: l.position })),
    ...world.foreignLands.map((l) => ({
      id: l.id,
      type: "foreign-land",
      label: l.label,
      position: l.position,
      properties: { fogged: true, dependencyId: l.dependencyId },
    })),
    ...world.transitions.flatMap((t) => [
      {
        id: t.id,
        type: "transition",
        label: t.label,
        position: t.from,
        properties: { toMap: t.to.mapId, toX: t.to.x, toY: t.to.y },
      },
      {
        id: `return-${t.id}`,
        type: "transition",
        label: t.label,
        position: t.to,
        properties: { toMap: t.from.mapId, toX: t.from.x, toY: t.from.y },
      },
    ]),
  ];
  return markers.filter((m) => m.position.mapId === mapId);
}
export function tiledMap(world: WorldModel, map: WorldMap) {
  const mapping = world.theme.mapping[map.biome];
  const tileLayer = (id: number, name: string, data: number[], properties: object[] = []) => ({
    id,
    name,
    type: "tilelayer" as const,
    x: 0,
    y: 0,
    width: map.width,
    height: map.height,
    opacity: 1,
    visible: true,
    data,
    properties,
  });
  const collision = tileLayer(
    3,
    "collision",
    map.collision.map((c) => (c ? world.theme.mapping[map.biome].wall : 0)),
    [{ name: "collision", type: "bool", value: true }],
  );
  collision.visible = false;
  const layers: object[] = [
    tileLayer(
      1,
      "ground",
      map.ground.map((t) => mapping[t]),
    ),
    tileLayer(
      2,
      "decor",
      map.decor.map((t) => mapping[t]),
    ),
    collision,
  ];
  layers.push({
    id: 4,
    name: "objects",
    type: "objectgroup",
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    draworder: "topdown",
    objects: markers(world, map.id).map((m, i) => ({
      id: i + 1,
      name: m.label,
      type: m.type,
      x: m.position.x * 16,
      y: m.position.y * 16,
      width: 16,
      height: 16,
      rotation: 0,
      visible: true,
      properties: [
        { name: "stableId", type: "string", value: m.id },
        ...Object.entries(m.properties ?? {}).map(([name, value]) => ({
          name,
          type: typeof value === "number" ? "int" : typeof value === "boolean" ? "bool" : "string",
          value,
        })),
      ],
    })),
  });
  if (map.flickering.some(Boolean))
    layers.push(
      tileLayer(
        5,
        "flickering",
        map.flickering.map((v) => (v ? mapping.path : 0)),
        [{ name: "confidence", type: "string", value: "guess" }],
      ),
    );
  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.11.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    width: map.width,
    height: map.height,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    nextlayerid: layers.length + 1,
    nextobjectid: markers(world, map.id).length + 1,
    layers,
    tilesets: [
      {
        firstgid: 1,
        name: world.theme.name,
        tilewidth: 16,
        tileheight: 16,
        tilecount: world.theme.tileCount,
        columns: world.theme.columns,
        image: `../${world.theme.image}`,
        imagewidth: 192,
        imageheight: 176,
        margin: 0,
        spacing: 0,
        tiles: [{ id: mapping.wall - 1, properties: [{ name: "collides", type: "bool", value: true }] }],
      },
    ],
  };
}
export function renderSvg(world: WorldModel, map: WorldMap): string {
  const scale = 8;
  const rects: string[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; ) {
      const tile = map.ground[y * map.width + x] ?? "grass";
      let end = x + 1;
      while (end < map.width && map.ground[y * map.width + end] === tile) end++;
      rects.push(
        `<rect x="${x * scale}" y="${y * scale}" width="${(end - x) * scale}" height="${scale}" fill="${tileColor(tile)}"/>`,
      );
      x = end;
    }
  const annotations: string[] = [];
  if (map.kind === "overworld")
    for (const region of world.regions)
      annotations.push(
        `<text x="${(region.bounds.x + 2) * scale}" y="${(region.bounds.y + 3) * scale}" font-size="11" fill="#fff" stroke="#17202b" stroke-width="2" paint-order="stroke">${escapeXml(region.name)}</text>`,
      );
  for (const b of world.buildings.filter((b) => b.door.mapId === map.id))
    annotations.push(
      `<text x="${b.bounds.x * scale}" y="${(b.bounds.y - 0.3) * scale}" font-size="8" fill="#fff" stroke="#17202b" stroke-width="2" paint-order="stroke">${escapeXml(b.label)}</text>`,
    );
  for (const m of markers(world, map.id)
    .filter((m) => !["building", "npc", "npc-outdoor", "transition"].includes(m.type))
    .sort((a, b) => Number(a.type === "monster") - Number(b.type === "monster")))
    annotations.push(
      `<g><circle cx="${(m.position.x + 0.5) * scale}" cy="${(m.position.y + 0.5) * scale}" r="3" fill="${m.type === "monster" ? "#ef8e98" : m.type === "portal" ? "#9ecbe3" : "#f6d798"}"/><title>${escapeXml(`${m.type}: ${m.label}`)}</title>${map.kind === "overworld" ? `<text x="${(m.position.x + 1) * scale}" y="${m.position.y * scale}" font-size="8" fill="#fff">${escapeXml(m.label)}</text>` : ""}</g>`,
    );
  for (const boss of world.bosses.filter((b) => b.arena.mapId === map.id))
    annotations.push(
      `<rect x="${boss.arena.bounds.x * scale}" y="${boss.arena.bounds.y * scale}" width="96" height="80" fill="none" stroke="#f6d798" stroke-width="2"><title>Reserved boss arena: ${escapeXml(boss.symbolId)}</title></rect>`,
    );
  if (map.flickering.some(Boolean))
    for (let i = 0; i < map.flickering.length; i++)
      if (map.flickering[i])
        annotations.push(
          `<rect x="${(i % map.width) * scale}" y="${Math.floor(i / map.width) * scale}" width="8" height="8" fill="none" stroke="#d4b0df" stroke-dasharray="2 2"/>`,
        );
  const label = `${world.kingdom.name} · ${map.kind} · ${world.regions.find((r) => r.mapId === map.id)?.name ?? "World map"}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 ${map.width * scale} ${map.height * scale + 28}"><title id="title">${escapeXml(label)}</title><rect width="100%" height="100%" fill="#171e2a"/><g transform="translate(0 28)">${rects.join("")}${annotations.join("")}</g><text x="8" y="18" font-family="monospace" font-size="12" fill="#f4f1df">${escapeXml(label)}</text></svg>\n`;
}
export const serializeWorld = (world: WorldModel) => `${JSON.stringify(world)}\n`;
export function writeWorld(input: WorldModel, directory: string, previewOnly = false): void {
  const world = WorldModelSchema.parse(input);
  const root = resolve(directory);
  const targetFor = (path: string) => {
    const target = resolve(root, path);
    const within = relative(root, target);
    if (within.startsWith("..") || within.startsWith("/") || /^[A-Za-z]:/.test(within))
      throw new Error("Unsafe output path");
    return target;
  };
  const write = (path: string, contents: string) => {
    const target = targetFor(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  if (!previewOnly) {
    write("world.json", serializeWorld(world));
    write("theme.json", `${JSON.stringify(world.theme, null, 2)}\n`);
    mkdirSync(join(root, "assets"), { recursive: true });
    copyFileSync(
      fileURLToPath(new URL("../../assets/kenney/tiny-dungeon/tilemap_packed.png", import.meta.url)),
      targetFor(world.theme.image),
    );
    copyFileSync(
      fileURLToPath(new URL("../../assets/kenney/tiny-dungeon/License.txt", import.meta.url)),
      targetFor("assets/KENNEY-LICENSE.txt"),
    );
  }
  for (const map of world.maps) {
    if (!previewOnly) write(map.path, `${JSON.stringify(tiledMap(world, map))}\n`);
    if (map.kind !== "interior")
      write(
        `preview/${map.kind === "overworld" ? "overworld" : `region-${world.regions.find((r) => r.mapId === map.id)?.id}`}.svg`,
        renderSvg(world, map),
      );
  }
}
