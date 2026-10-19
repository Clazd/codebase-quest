import { z } from "zod";
import { ConfidenceSchema, LanguageSchema, SymbolMetricsSchema } from "./codeGraph.ts";

const Id = z.string().min(1);
const Line = z.number().int().positive();

/** A reference from a fact sheet to another symbol (or a file, for module-level calls). */
export const FactLinkSchema = z.object({
  symbolId: Id.nullable(),
  name: z.string(),
  path: z.string(),
  line: Line,
  confidence: ConfidenceSchema,
});
/**
 * Everything the Code Panel shows about one symbol. Derived only from the CodeGraph
 * (deterministic facts); Phase 06 reuses fact sheets as AI grounding.
 */
export const FactSheetSchema = z.object({
  symbolId: Id,
  npcId: Id.nullable(),
  name: z.string(),
  qualifiedName: z.string(),
  displayName: z.string(),
  kind: z.enum(["function", "class", "method", "interface", "type"]),
  language: LanguageSchema.nullable(),
  fileId: Id,
  path: z.string(),
  regionId: Id.nullable(),
  buildingId: Id.nullable(),
  group: z.object({ kind: z.enum(["class", "module"]), key: z.string(), label: z.string() }),
  range: z.object({ startLine: Line, endLine: Line }),
  signature: z.string(),
  /** Doc comment text without comment markers, with obvious secrets masked. */
  doc: z.string().nullable(),
  /** The doc comment's first sentence, quoted verbatim by dialogue. */
  docSummary: z.string().nullable(),
  exported: z.boolean(),
  async: z.boolean(),
  traits: z.array(z.string()),
  metrics: SymbolMetricsSchema,
  callers: z.array(FactLinkSchema),
  callees: z.array(FactLinkSchema),
  testedBy: z.array(FactLinkSchema),
  /** Symbols under test, for test functions. */
  tests: z.array(FactLinkSchema),
  /** Names of called symbols that themselves do I/O. */
  ioVia: z.array(z.string()),
});
export const FactFileSchema = z.object({
  id: Id,
  path: z.string(),
  language: LanguageSchema.nullable(),
  hash: z.string(),
  loc: z.number().int().nonnegative(),
});
/** Local-only links added by the play server; never part of deterministic output. */
export const FactLinksSchema = z.object({
  root: z.string().nullable(),
  github: z.string().nullable(),
  editor: z.string(),
});
export const FactBookSchema = z.object({
  schemaVersion: z.literal(1),
  repo: z.object({ name: z.string(), commit: z.string().nullable() }),
  files: z.array(FactFileSchema),
  symbols: z.array(FactSheetSchema),
  links: FactLinksSchema.nullable(),
});
export type FactLink = z.infer<typeof FactLinkSchema>;
export type FactSheet = z.infer<typeof FactSheetSchema>;
export type FactFile = z.infer<typeof FactFileSchema>;
export type FactLinks = z.infer<typeof FactLinksSchema>;
export type FactBook = z.infer<typeof FactBookSchema>;
