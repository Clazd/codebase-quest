import { LiteralValueSchema } from "@codebase-quest/shared";
import { z } from "zod";

/** Code-Body Combat contracts (MASTER-PLAN §16.4). Generated, deterministic, zod-validated. */
export const CellKindSchema = z.enum(["joint", "body", "organ", "armor", "heart"]);
export type CellKind = z.infer<typeof CellKindSchema>;
export const MAX_CELLS = 40;
export const CellSchema = z.object({
  id: z.string(),
  /** Order of appearance (cells starting on the same line share a row). */
  row: z.number().int().min(0),
  /** Nesting depth relative to the function body. */
  col: z.number().int().min(0),
  kind: CellKindSchema,
  /** 1-based inclusive line range in the real file. */
  lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  hp: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  label: z.string(),
  /** The innermost limb this cell belongs to. */
  limbId: z.string().optional(),
  /** Organs: the symbol this call reaches (exact call edge). */
  calleeId: z.string().optional(),
  calleeName: z.string().optional(),
  /** Organs: minion body summoned when ignored. */
  minionId: z.string().optional(),
  /** Hearts: joints deciding whether execution reaches this heart. All destroyed → exposed; none → exposed. */
  guardJointIds: z.array(z.string()).optional(),
  guardArmorIds: z.array(z.string()).optional(),
  /** Merged run of ordinary statements ("▤ n lines"). */
  grouped: z.number().int().min(2).optional(),
  /** Twists: Mimic difference, Gremlin TODO, Imp literal, Mutant corruption, Shadow darkness. */
  twinDiff: z.boolean().optional(),
  todo: z.string().optional(),
  sparkle: z.string().optional(),
  corrupted: z.boolean().optional(),
  dark: z.boolean().optional(),
});
export type Cell = z.infer<typeof CellSchema>;
export const LimbSchema = z.object({ id: z.string(), jointId: z.string(), cellIds: z.array(z.string()) });
export type Limb = z.infer<typeof LimbSchema>;
export const BodyInputSchema = z.object({
  id: z.string(),
  args: z.array(LiteralValueSchema),
  telegraph: z.string(),
  /** The cells the input passes through; `[exit]` alone when only the exit is known (test assertion). */
  pathCellIds: z.array(z.string()).min(1),
  exitHeartId: z.string(),
  source: z.enum(["evaluator", "test-assertion"]),
  evidence: z.string(),
});
export type BodyInput = z.infer<typeof BodyInputSchema>;
export const CodeBodySchema = z.object({
  id: z.string(),
  symbolId: z.string(),
  name: z.string(),
  path: z.string(),
  language: z.string(),
  params: z.array(z.string()),
  /** The real source lines (secrets masked), for the Code Panel. */
  code: z.object({ startLine: z.number().int().min(1), lines: z.array(z.string()) }),
  cells: z.array(CellSchema).min(1).max(MAX_CELLS),
  limbs: z.array(LimbSchema),
  inputs: z.array(BodyInputSchema),
});
export type CodeBody = z.infer<typeof CodeBodySchema>;
/** The body as the client may show it before answers: identical, but named for clarity. */
export type PublicCodeBody = Omit<CodeBody, "inputs"> & { inputs: Omit<BodyInput, "pathCellIds" | "exitHeartId">[] };

export const GroundTruthSourceSchema = z.enum([
  "call-graph",
  "ast",
  "test-assertion",
  "mutation",
  "type-info",
  "evaluator",
  "git",
  "diff",
  "opinion",
]);
export const QUESTION_TYPES = [
  "trace",
  "who-calls",
  "order-steps",
  "fill-gap",
  "mutant-hunt",
  "predict",
  "type-sense",
  "path-finder",
  "lost-error",
  "path",
  "exit",
  "compare",
  "field-sense",
  "echo",
  "maze",
  "classify-todo",
  "name-constant",
  "investigate",
] as const;
export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export const ActionSchema = z.enum([
  "trace",
  "sever",
  "disable",
  "armor",
  "pierce",
  "compare",
  "hunt",
  "prove",
  "investigate",
  "classify",
  "name",
  "match",
  "maze",
  "reach",
  "shape",
]);
export type QuestionAction = z.infer<typeof ActionSchema>;
export const QuestionSchema = z
  .object({
    id: z.string(),
    type: QuestionTypeSchema,
    action: ActionSchema,
    cellId: z.string().optional(),
    inputId: z.string().optional(),
    prompt: z.string(),
    choices: z.array(z.string()).min(2).max(6),
    /** The correct choice; null for opinion questions (XP only, never `understood`). */
    answer: z.number().int().min(0).nullable(),
    scored: z.boolean(),
    source: GroundTruthSourceSchema,
    /** Where a human can check the answer (`path:line`). */
    evidence: z.string(),
    /** Shown after answering (template text from the facts). */
    explanation: z.string(),
    /** Symbols whose understanding this question demonstrates. */
    symbolIds: z.array(z.string()),
  })
  .refine(
    (q) =>
      q.scored
        ? q.answer !== null && q.answer < q.choices.length && q.source !== "opinion"
        : q.answer === null && q.source === "opinion",
    "Scoring and answer must agree",
  )
  .refine((q) => new Set(q.choices).size === q.choices.length, "Choices must be distinct");
export type Question = z.infer<typeof QuestionSchema>;
export const MONSTER_KINDS = [
  "gremlin",
  "serpent",
  "mimic",
  "mutant",
  "ghost",
  "wisp",
  "minotaur",
  "imp",
  "wraith",
  "shapeshifter",
  "echo",
  "shadow",
] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];
export const HintSchema = z.object({
  nudge: z.string(),
  pointer: z.object({
    text: z.string(),
    lines: z.array(z.tuple([z.number(), z.number()])).optional(),
    cellIds: z.array(z.string()).optional(),
  }),
  explanation: z.string(),
});
export const EncounterSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  smellId: z.string().nullable(),
  kind: z.enum(MONSTER_KINDS),
  name: z.string(),
  species: z.string(),
  level: z.number().int().min(1),
  spriteFrame: z.number().int().min(0),
  intro: z.string(),
  /** The grid twist (MASTER-PLAN §8). */
  twist: z.object({
    kind: z.enum([
      "none",
      "todo",
      "mirror",
      "mutation",
      "no-tethers",
      "flicker",
      "maze",
      "sparkle",
      "armor",
      "shapeshift",
      "voices",
      "shadow",
    ]),
    text: z.string(),
    /** Actions that resolve the twist (its questions have the same action). */
    actions: z.array(ActionSchema),
  }),
  bodies: z.array(CodeBodySchema).min(1).max(2),
  minions: z.array(CodeBodySchema.extend({ spriteFrame: z.number().int().min(0) })),
  questions: z.array(QuestionSchema),
  hints: z.record(z.string(), HintSchema),
  phases: z.array(
    z.object({
      name: z.string(),
      heartsLeft: z.number().int().min(0),
      telegraph: z.string(),
      rehide: z.boolean(),
      wrongPredictionBonus: z.number().int().min(0),
    }),
  ),
  smellAttack: z.object({ name: z.string(), text: z.string(), focusDamage: z.number().int().min(0) }),
  bestiary: z.object({
    smellKind: z.string(),
    title: z.string(),
    path: z.string(),
    lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    message: z.string(),
    measured: z.number().nullable(),
    threshold: z.number().nullable(),
    fix: z.string(),
    teaches: z.string(),
  }),
});
export type Encounter = z.infer<typeof EncounterSchema>;
export type Minion = Encounter["minions"][number];
