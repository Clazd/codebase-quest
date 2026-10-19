import { z } from "zod";

const Id = z.string().regex(/^[a-f0-9]{12}$/);
export const BodyMapSchema = z.object({
  name: z.string().max(200),
  path: z.string().max(400),
  cells: z
    .array(
      z.tuple([z.number().int().min(0), z.number().int().min(0), z.enum(["joint", "body", "organ", "armor", "heart"])]),
    )
    .max(40),
  at: z.string().max(40),
});
export const BestiaryEntrySchema = z.object({
  name: z.string().max(200),
  species: z.string().max(80),
  smellKind: z.string().max(60),
  title: z.string().max(400),
  path: z.string().max(400),
  lines: z.tuple([z.number().int(), z.number().int()]),
  message: z.string().max(400),
  measured: z.number().nullable(),
  threshold: z.number().nullable(),
  fix: z.string().max(1000),
  outcome: z.enum(["victory", "tamed"]),
  note: z.string().max(2000),
  at: z.string().max(40),
});
export const CodexDataSchema = z.object({
  version: z.literal(1),
  entries: z.record(Id, z.object({ readAt: z.string().max(40), note: z.string().max(20000) })),
  bodyMaps: z.record(Id, BodyMapSchema).default({}),
  bestiary: z.record(z.string().max(80), BestiaryEntrySchema).default({}),
  understood: z.array(Id).default([]),
});
