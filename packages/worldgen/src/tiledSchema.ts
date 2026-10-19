import { z } from "zod";

// The finite, orthogonal Tiled JSON subset emitted here (not all Tiled features).
const Property = z.object({
  name: z.string(),
  type: z.enum(["string", "bool", "int"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
const TileLayer = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.literal("tilelayer"),
  x: z.number(),
  y: z.number(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  opacity: z.number(),
  visible: z.boolean(),
  data: z.array(z.number().int().nonnegative()),
  properties: z.array(Property),
});
const ObjectLayer = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.literal("objectgroup"),
  x: z.number(),
  y: z.number(),
  opacity: z.number(),
  visible: z.boolean(),
  draworder: z.literal("topdown"),
  objects: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      type: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      rotation: z.number(),
      visible: z.boolean(),
      properties: z.array(Property),
    }),
  ),
});
export const TiledMapSchema = z
  .object({
    type: z.literal("map"),
    version: z.string(),
    tiledversion: z.string(),
    orientation: z.literal("orthogonal"),
    renderorder: z.literal("right-down"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tilewidth: z.literal(16),
    tileheight: z.literal(16),
    infinite: z.literal(false),
    nextlayerid: z.number().int(),
    nextobjectid: z.number().int(),
    layers: z.array(z.discriminatedUnion("type", [TileLayer, ObjectLayer])),
    tilesets: z.array(
      z.object({
        firstgid: z.number().int().positive(),
        name: z.string(),
        tilewidth: z.literal(16),
        tileheight: z.literal(16),
        tilecount: z.number().int().positive(),
        columns: z.number().int().positive(),
        image: z.string(),
        imagewidth: z.number().positive(),
        imageheight: z.number().positive(),
        margin: z.literal(0),
        spacing: z.literal(0),
        tiles: z.array(z.object({ id: z.number().int().nonnegative(), properties: z.array(Property) })),
      }),
    ),
  })
  .superRefine((map, ctx) => {
    for (const name of ["ground", "decor", "collision", "objects"])
      if (!map.layers.some((l) => l.name === name)) ctx.addIssue({ code: "custom", message: `Missing ${name} layer` });
    const max = map.tilesets.reduce((n, t) => Math.max(n, t.firstgid + t.tilecount - 1), 0);
    for (const layer of map.layers)
      if (
        layer.type === "tilelayer" &&
        (layer.data.length !== map.width * map.height || layer.data.some((gid) => gid > max))
      )
        ctx.addIssue({ code: "custom", message: "Tile dimensions or GIDs out of bounds" });
  });
