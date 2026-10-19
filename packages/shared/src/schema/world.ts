import { z } from "zod";

const Id = z.string().min(1);
const Coordinate = z.number().int().nonnegative();
export const RectSchema = z.object({
  x: Coordinate,
  y: Coordinate,
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export const WorldPositionSchema = z.object({ mapId: Id, x: Coordinate, y: Coordinate });
export const AbstractTileSchema = z.enum([
  "empty",
  "grass",
  "path",
  "road",
  "road-wide",
  "water",
  "bridge",
  "wall",
  "floor",
  "door",
  "tree",
  "rock",
  "sand",
  "plaza",
  "dock",
  "ruin",
  "fog-edge",
  "arena-floor",
]);
export const BiomeSchema = z.enum([
  "port",
  "mines",
  "artisan",
  "capital",
  "bazaar",
  "training",
  "clocktower",
  "forge",
  "library",
  "fortress",
  "ruins",
  "wildlands",
]);
export const WorldMapSchema = z
  .object({
    id: Id,
    path: z.string(),
    kind: z.enum(["overworld", "region", "interior"]),
    biome: BiomeSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    ground: z.array(AbstractTileSchema),
    decor: z.array(AbstractTileSchema),
    collision: z.array(z.union([z.literal(0), z.literal(1)])),
    flickering: z.array(z.union([z.literal(0), z.literal(1)])),
  })
  .superRefine((map, ctx) => {
    for (const key of ["ground", "decor", "collision", "flickering"] as const)
      if (map[key].length !== map.width * map.height)
        ctx.addIssue({ code: "custom", message: `${key} dimensions do not match map` });
  });
export const RegionSchema = z.object({
  id: Id,
  name: z.string(),
  path: z.string(),
  biome: BiomeSchema,
  loc: Coordinate,
  fileIds: z.array(Id),
  districtIds: z.array(Id),
  bounds: RectSchema,
  mapId: Id,
  entrance: WorldPositionSchema,
  spawn: WorldPositionSchema,
});
export const DistrictSchema = z.object({
  id: Id,
  regionId: Id,
  name: z.string(),
  path: z.string(),
  bounds: RectSchema,
});
export const BuildingSchema = z.object({
  id: Id,
  regionId: Id,
  districtId: Id,
  fileIds: z.array(Id).min(1),
  label: z.string(),
  size: z.enum(["hut", "house", "manor", "castle"]),
  type: z.enum([
    "house",
    "town-square",
    "training-hall",
    "library",
    "town-hall",
    "clocktower",
    "harbor",
    "watchtower",
    "archive",
    "statue",
    "row-house",
  ]),
  bounds: RectSchema,
  door: WorldPositionSchema,
  interiorId: Id,
  traits: z.object({
    ageDays: Coordinate.nullable(),
    churn: Coordinate,
    recentlyChanged: z.boolean(),
    crackLevel: Coordinate,
    tested: z.boolean(),
  }),
});
export const InteriorSchema = z.object({
  id: Id,
  buildingId: Id,
  mapId: Id,
  template: z.string(),
  entrance: WorldPositionSchema,
  rooms: z.array(z.object({ id: Id, classSymbolId: Id.nullable(), bounds: RectSchema })),
});
export const NpcPlacementSchema = z.object({
  id: Id,
  symbolId: Id,
  buildingId: Id,
  position: WorldPositionSchema,
  outdoor: WorldPositionSchema.nullable(),
  crowdId: Id.nullable(),
});
export const MonsterSpawnSchema = z.object({
  id: Id,
  smellId: Id,
  kind: z.string(),
  buildingId: Id,
  regionId: Id,
  position: WorldPositionSchema,
  patrolRadius: z.number().int().min(3).max(6),
  level: z.number().int().positive(),
});
export const BossLairSchema = z.object({
  id: Id,
  symbolId: Id,
  buildingId: Id,
  regionId: Id,
  arena: z.object({ mapId: Id, bounds: RectSchema }),
});
export const DungeonEntranceSchema = z.object({
  id: Id,
  chainSymbolIds: z.array(Id).min(4),
  regionId: Id,
  position: WorldPositionSchema,
});
export const PortalSchema = z.object({
  id: Id,
  entryPointId: Id,
  label: z.string(),
  regionId: Id,
  position: WorldPositionSchema,
});
export const RoadSchema = z.object({
  id: Id,
  from: Id,
  to: Id,
  weight: Coordinate,
  width: z.number().int().min(1).max(3),
  confidence: z.enum(["exact", "likely", "guess"]),
  reason: z.enum(["connectivity", "code-edges", "uncertain"]),
  tiles: z.array(z.object({ x: Coordinate, y: Coordinate })),
});
export const LandmarkSchema = z.object({
  id: Id,
  type: z.enum([
    "gate",
    "quest-board",
    "chronicle-stone",
    "hall-of-heroes",
    "bazaar-shop",
    "whirlpool",
    "plaza",
    "library",
    "town-hall",
    "watchtower",
    "harbor",
    "clocktower",
  ]),
  label: z.string(),
  position: WorldPositionSchema,
});
export const TransitionSchema = z.object({
  id: Id,
  kind: z.enum(["region", "interior"]),
  from: WorldPositionSchema,
  to: WorldPositionSchema,
  label: z.string(),
});
export const WorldModelSchema = z.object({
  schemaVersion: z.literal(1),
  seed: z.string(),
  sourceCommit: z.string().nullable(),
  referenceDate: z.string().nullable(),
  kingdom: z.object({ name: z.string(), overworldMap: Id, gate: WorldPositionSchema }),
  theme: z.object({
    name: z.string(),
    tileSize: z.literal(16),
    image: z.string(),
    columns: z.number().int().positive(),
    tileCount: z.number().int().positive(),
    mapping: z.record(BiomeSchema, z.record(AbstractTileSchema, Coordinate)),
  }),
  regions: z.array(RegionSchema),
  districts: z.array(DistrictSchema),
  buildings: z.array(BuildingSchema),
  interiors: z.array(InteriorSchema),
  npcs: z.array(NpcPlacementSchema),
  monsters: z.array(MonsterSpawnSchema),
  bosses: z.array(BossLairSchema),
  dungeons: z.array(DungeonEntranceSchema),
  portals: z.array(PortalSchema),
  roads: z.array(RoadSchema),
  foreignLands: z.array(
    z.object({ id: Id, dependencyId: Id, label: z.string(), position: WorldPositionSchema, fogged: z.literal(true) }),
  ),
  landmarks: z.array(LandmarkSchema),
  transitions: z.array(TransitionSchema),
  maps: z.array(WorldMapSchema),
  aggregation: z.array(z.object({ buildingId: Id, fileIds: z.array(Id), reason: z.literal("small-files-row-house") })),
});
export type Rect = z.infer<typeof RectSchema>;
export type WorldPosition = z.infer<typeof WorldPositionSchema>;
export type AbstractTile = z.infer<typeof AbstractTileSchema>;
export type Biome = z.infer<typeof BiomeSchema>;
export type WorldMap = z.infer<typeof WorldMapSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type District = z.infer<typeof DistrictSchema>;
export type Building = z.infer<typeof BuildingSchema>;
export type Interior = z.infer<typeof InteriorSchema>;
export type NpcPlacement = z.infer<typeof NpcPlacementSchema>;
export type WorldModel = z.infer<typeof WorldModelSchema>;
