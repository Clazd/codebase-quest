import { LiteralValueSchema } from "@codebase-quest/shared";
import { z } from "zod";

// Prototype data contracts for Code-Body Combat (MASTER-PLAN §16.4, extended
// with hand-written questions, hints and monster details). Phase 07 replaces
// these with generated bodies; until then every file is written by hand.

export const CellKindSchema = z.enum(["joint", "body", "organ", "armor", "heart"]);
export type CellKind = z.infer<typeof CellKindSchema>;

export const GroundTruthSourceSchema = z.enum([
  "call-graph",
  "ast",
  "test-assertion",
  "mutation",
  "type-info",
  "evaluator",
  "git",
  "opinion",
]);

export const CellSchema = z.object({
  id: z.string(),
  /** Statement order, top to bottom. */
  row: z.number().int().min(0),
  /** Nesting depth. */
  col: z.number().int().min(0),
  kind: CellKindSchema,
  /** 1-based, inclusive line range in the fixture file. */
  lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  hp: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Short code summary shown once the cell is revealed. */
  label: z.string(),
  /** The innermost limb this cell belongs to (cells nested under a joint). */
  limbId: z.string().optional(),
  /** Organs: the function this call reaches. */
  calleeId: z.string().optional(),
  /** Organs: the minion body summoned when the organ is ignored. */
  minionId: z.string().optional(),
  /** Hearts: joints that decide whether execution reaches this heart. All destroyed → exposed. */
  guardJointIds: z.array(z.string()).optional(),
  /** Mimic twins: this cell differs from its twin (the weak point). */
  twinDiff: z.boolean().optional(),
});
export type Cell = z.infer<typeof CellSchema>;

export const LimbSchema = z.object({
  id: z.string(),
  jointId: z.string(),
  /** Every cell nested under the joint, at any depth. */
  cellIds: z.array(z.string()).min(1),
});

export const InputSchema = z.object({
  id: z.string(),
  args: z.array(LiteralValueSchema),
  /** Explicit clock for hand-checked paths containing Date.now(). */
  now: z.number().optional(),
  /** How the monster telegraphs it: "Incoming: …!" */
  telegraph: z.string(),
  pathCellIds: z.array(z.string()).min(1),
  exitHeartId: z.string(),
  source: z.enum(["evaluator", "test-assertion"]),
  evidence: z.string(),
});
export type BodyInput = z.infer<typeof InputSchema>;

export const ActionSchema = z.enum(["sever", "pierce", "disable", "armor", "trace", "compare"]);
export type QuestionAction = z.infer<typeof ActionSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  action: ActionSchema,
  /** The target cell (joint, heart, organ, armor, or a twin cell for compare). */
  cellId: z.string().optional(),
  /** Trace questions: the input being traced. */
  inputId: z.string().optional(),
  prompt: z.string(),
  choices: z.array(z.string()).min(2),
  answer: z.number().int().min(0),
  source: GroundTruthSourceSchema,
  /** Where a human can check the answer. */
  evidence: z.string(),
  /** Shown after answering. */
  explanation: z.string(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const BodySchema = z.object({
  id: z.string(),
  symbolId: z.string(),
  name: z.string(),
  /** Path of the fixture file, from the repository root. */
  source: z.string().startsWith("fixtures/repos/tiny-ts/"),
  /** The function's source, copied from the fixture (tests check it still matches). */
  code: z.object({ startLine: z.number().int().min(1), lines: z.array(z.string()).min(1) }),
  cells: z.array(CellSchema).min(1).max(40),
  limbs: z.array(LimbSchema),
  inputs: z.array(InputSchema),
});
export type Body = z.infer<typeof BodySchema>;

export const MonsterSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  smell: z.string(),
  intro: z.string(),
  /** Frame in the Kenney Tiny Dungeon sheet (placeholder art). */
  spriteFrame: z.number().int().min(0),
  twist: z.enum(["none", "mimic"]),
  /** One body, or two for a Mimic. */
  bodies: z.array(BodySchema).min(1).max(2),
  /** Small bodies summoned by ignored organs. */
  minions: z.array(BodySchema.extend({ spriteFrame: z.number().int().min(0) })),
  questions: z.array(QuestionSchema),
  /** Ask Gitling: one fixed hint per cell. */
  hints: z.record(z.string(), z.string()),
  phases: z.array(
    z.object({
      name: z.string(),
      /** Starts when this many main-body hearts (or fewer) are left. */
      heartsLeft: z.number().int().min(0),
      telegraph: z.string(),
      rehide: z.boolean(),
      wrongPredictionBonus: z.number().int().min(0),
    }),
  ),
  smellAttack: z.object({
    name: z.string(),
    text: z.string(),
    focusDamage: z.number().int().min(0),
  }),
});
export type Monster = z.infer<typeof MonsterSchema>;
export type MinionBody = Monster["minions"][number];
