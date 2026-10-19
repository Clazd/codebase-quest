import { z } from "zod";
export const StateSchema = z.enum(["unseen", "seen", "read", "understood", "mastered"]);
export type Comprehension = z.infer<typeof StateSchema>;
export const STATES: Comprehension[] = ["unseen", "seen", "read", "understood", "mastered"];
export const WEIGHTS = { unseen: 0, seen: 0.1, read: 0.4, understood: 0.8, mastered: 1 } as const;
export const ObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visit"), buildingId: z.string() }),
  z.object({ kind: z.literal("talk"), symbolId: z.string() }),
  z.object({ kind: z.literal("defeat"), smellId: z.string() }),
  z.object({ kind: z.literal("answer"), symbolId: z.string(), puzzleTypes: z.array(z.string()).optional() }),
  z.object({ kind: z.literal("collect"), codexIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("deliver"), path: z.array(z.string()).min(2) }),
  z.object({ kind: z.literal("find"), query: z.string(), answerSymbolIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("welcome"), step: z.enum(["gate", "readme", "gitling"]) }),
]);
export type Objective = z.infer<typeof ObjectiveSchema>;
export const QuestSchema = z.object({
  id: z.string(),
  type: z.enum(["main", "exploration", "delivery", "escort", "bounty", "investigation", "collection", "daily"]),
  title: z.string(),
  summary: z.string(),
  chapter: z.number().int().optional(),
  ordered: z.boolean(),
  objectives: z.array(ObjectiveSchema).min(1),
  prerequisites: z.array(z.string()),
  rewards: z.object({
    xp: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    items: z.array(z.string()),
    keys: z.array(z.string()),
  }),
  regionId: z.string().nullable(),
  path: z.array(z.string()),
  narration: z.object({ intro: z.string(), outro: z.string() }),
});
export type QuestDef = z.infer<typeof QuestSchema>;
export const QuestProgressSchema = z.object({
  state: z.enum(["locked", "available", "active", "completed"]),
  counts: z.array(z.number().int().nonnegative()),
  rewarded: z.boolean(),
});
export type QuestProgress = z.infer<typeof QuestProgressSchema>;
const PositionSchema = z.object({
  mapId: z.string(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});
export const AtlasSymbolSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: z.enum(["function", "method", "class", "interface", "type"]),
  fileId: z.string(),
  regionId: z.string(),
  hash: z.string(),
  loc: z.number().nonnegative(),
  signature: z.string(),
  doc: z.string().nullable(),
  parameters: z.number().int().nonnegative(),
  returnType: z.string().nullable(),
  steps: z.array(
    z.object({
      line: z.number().int(),
      text: z.string(),
      depth: z.number().int(),
      branch: z.string().nullable(),
      route: z.enum(["then", "else"]).nullable(),
      guards: z.array(z.enum(["then", "else"])).default([]),
    }),
  ),
  callers: z.array(z.string()),
  callOrder: z.array(z.string()),
  testedBy: z.array(z.string()),
  position: PositionSchema,
});
export const AtlasSchema = z.object({
  version: z.literal(1),
  repoId: z.string(),
  commit: z.string().nullable(),
  quests: z.array(QuestSchema),
  symbols: z.array(AtlasSymbolSchema),
  files: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      hash: z.string(),
      buildingId: z.string().nullable(),
      imports: z.array(z.string()),
      importers: z.array(z.string()),
      firstCommitAt: z.string().nullable(),
      lastCommitAt: z.string().nullable(),
      coverage: z.number().min(0).max(1).nullable(),
    }),
  ),
  gates: z.array(z.object({ regionId: z.string(), key: z.string(), sourceRegionId: z.string() })),
  dependencies: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().int().positive() })),
  deliveries: z.array(
    z.object({ from: z.string(), to: z.string(), via: z.string(), line: z.number().int(), owner: z.string() }),
  ),
  assertions: z.array(z.object({ symbolId: z.string(), path: z.string(), line: z.number().int().positive() })),
  dailyCandidates: z.array(z.object({ encounterId: z.string(), symbolId: z.string() })),
  readme: z.string(),
  finale: z.literal("Awaiting Phase 09: the Architect's Shadow"),
});
export type Atlas = z.infer<typeof AtlasSchema>;
export type AtlasSymbol = z.infer<typeof AtlasSymbolSchema>;
export type GameEvent =
  | { kind: "welcome"; step: "gate" | "readme" | "gitling" }
  | { kind: "visit"; buildingId: string; regionId: string }
  | { kind: "talk" | "read" | "seen"; symbolId: string }
  | { kind: "answer"; symbolId: string; puzzleType: string; evidence: string; firstTry?: boolean }
  | { kind: "defeat"; smellId: string; symbolIds: string[]; xp: number }
  | { kind: "find"; symbolId: string; query: string }
  | { kind: "doc"; fileId: string };
/** Browser-safe FNV-1a for stable identities and date seeds. */
export function hash(text: string): string {
  let n = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) n = BigInt.asUintN(64, (n ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return n.toString(16).padStart(16, "0");
}
