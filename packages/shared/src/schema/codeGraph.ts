import { z } from "zod";
import { LiteralValueSchema } from "./placeholders.ts";

export const LanguageSchema = z.enum(["typescript", "tsx", "javascript", "jsx", "python"]);
export const FileRoleSchema = z.enum([
  "source",
  "test",
  "config",
  "docs",
  "build",
  "ci",
  "manifest",
  "migration",
  "generated",
  "asset",
]);
export const ConfidenceSchema = z.enum(["exact", "likely", "guess"]);
const Id = z.string().regex(/^[a-f0-9]{12}$/);
const Count = z.number().int().nonnegative();
export const SourceRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  startColumn: Count,
  endColumn: Count,
});
export const GitStatsSchema = z.object({
  firstCommitAt: z.string(),
  lastCommitAt: z.string(),
  commits: Count,
  churn: Count,
  authors: Count,
});
export const ModuleNodeSchema = z.object({
  id: Id,
  path: z.string(),
  name: z.string(),
  kind: z.enum(["directory", "external"]),
  declared: z.boolean(),
});
export const FileNodeSchema = z.object({
  id: Id,
  path: z.string(),
  moduleId: Id,
  language: LanguageSchema.nullable(),
  role: FileRoleSchema,
  loc: Count,
  symbolCount: Count,
  smellCount: Count,
  hash: z.string(),
  git: GitStatsSchema.nullable(),
  docs: z.string().nullable(),
});
export const SymbolMetricsSchema = z.object({
  loc: Count,
  cyclomatic: Count,
  maxNesting: Count,
  params: Count,
  fanIn: Count,
  fanOut: Count,
  dynamicCalls: Count,
});
export const SymbolNodeSchema = z.object({
  id: Id,
  fileId: Id,
  parentId: Id.nullable(),
  kind: z.enum(["function", "class", "method", "interface", "type"]),
  name: z.string(),
  qualifiedName: z.string(),
  range: SourceRangeSchema,
  exported: z.boolean(),
  async: z.boolean(),
  generator: z.boolean(),
  parameters: z.array(z.object({ name: z.string(), type: z.string().nullable() })),
  returnType: z.string().nullable(),
  doc: z.string().nullable(),
  decorators: z.array(z.string()),
  traits: z.array(z.string()),
  metrics: SymbolMetricsSchema,
});
export const EdgeSchema = z.object({
  id: Id,
  from: Id,
  to: Id,
  kind: z.enum(["imports", "calls", "extends", "implements", "tests"]),
  confidence: ConfidenceSchema,
  line: z.number().int().positive(),
  label: z.string(),
});
export const SmellKindSchema = z.enum([
  "todo-comment",
  "complex-function",
  "duplicate-code",
  "injected-mutation",
  "dead-code",
  "possibly-dead-code",
  "deep-nesting",
  "magic-number",
  "swallowed-error",
  "missing-types",
  "long-parameter-list",
  "untested-code",
  "huge-file",
  "god-class",
  "circular-dependency",
]);
export const SmellSchema = z.object({
  id: Id,
  kind: SmellKindSchema,
  fileIds: z.array(Id).min(1),
  symbolIds: z.array(Id),
  range: SourceRangeSchema,
  severity: z.number().positive(),
  evidence: z.object({ message: z.string(), measured: z.number().nullable(), threshold: z.number().nullable() }),
});
export const EntryPointSchema = z.object({
  id: Id,
  fileId: Id,
  symbolId: Id.nullable(),
  kind: z.enum(["main", "http", "cli", "event"]),
  label: z.string(),
  range: SourceRangeSchema,
});
export const TestAssertionSchema = z.object({
  id: Id,
  testFileId: Id,
  line: z.number().int().positive(),
  calleeSymbolId: Id,
  args: z.array(LiteralValueSchema),
  expected: LiteralValueSchema,
  matcher: z.enum(["equal", "deep-equal"]),
});
export const DiagnosticSchema = z.object({
  id: Id,
  path: z.string().nullable(),
  code: z.string(),
  line: z.number().int().positive().nullable(),
  message: z.string(),
});
export const CodeGraphSchema = z
  .object({
    schemaVersion: z.literal(1),
    repo: z.object({
      name: z.string(),
      commit: z.string().nullable(),
      languages: z.array(z.object({ language: LanguageSchema, files: Count, loc: Count })),
    }),
    modules: z.array(ModuleNodeSchema),
    files: z.array(FileNodeSchema),
    symbols: z.array(SymbolNodeSchema),
    edges: z.array(EdgeSchema),
    smells: z.array(SmellSchema),
    entryPoints: z.array(EntryPointSchema),
    testFacts: z.array(TestAssertionSchema),
    diagnostics: z.array(DiagnosticSchema),
  })
  .superRefine((graph, ctx) => {
    const nodes = [...graph.modules, ...graph.files, ...graph.symbols];
    const ids = new Set(nodes.map((n) => n.id));
    const all = [
      ...nodes,
      ...graph.edges,
      ...graph.smells,
      ...graph.entryPoints,
      ...graph.testFacts,
      ...graph.diagnostics,
    ];
    if (new Set(all.map((n) => n.id)).size !== all.length) ctx.addIssue({ code: "custom", message: "Duplicate IDs" });
    const files = new Map(graph.files.map((f) => [f.id, f]));
    const symbols = new Set(graph.symbols.map((s) => s.id));
    const modules = new Set(graph.modules.map((m) => m.id));
    const problem = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const f of graph.files)
      if (
        !modules.has(f.moduleId) ||
        f.path.includes("\\") ||
        f.path.startsWith("/") ||
        f.path.split("/").includes("..")
      )
        problem(`Invalid file ${f.id}`);
    for (const s of graph.symbols) {
      const f = files.get(s.fileId);
      if (
        !f ||
        s.range.endLine > f.loc ||
        s.range.startLine > s.range.endLine ||
        (s.parentId && !symbols.has(s.parentId))
      )
        problem(`Invalid symbol ${s.id}`);
    }
    for (const e of graph.edges) if (!ids.has(e.from) || !ids.has(e.to)) problem(`Dangling edge ${e.id}`);
    for (const s of graph.smells)
      if (s.fileIds.some((id) => !files.has(id)) || s.symbolIds.some((id) => !symbols.has(id)))
        problem(`Invalid smell ${s.id}`);
    for (const e of graph.entryPoints)
      if (!files.has(e.fileId) || (e.symbolId && !symbols.has(e.symbolId))) problem(`Invalid entry ${e.id}`);
    for (const f of graph.testFacts)
      if (!files.has(f.testFileId) || !symbols.has(f.calleeSymbolId)) problem(`Invalid assertion ${f.id}`);
  });
export type Language = z.infer<typeof LanguageSchema>;
export type FileRole = z.infer<typeof FileRoleSchema>;
export type SourceRange = z.infer<typeof SourceRangeSchema>;
export type GitStats = z.infer<typeof GitStatsSchema>;
export type ModuleNode = z.infer<typeof ModuleNodeSchema>;
export type FileNode = z.infer<typeof FileNodeSchema>;
export type SymbolNode = z.infer<typeof SymbolNodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Smell = z.infer<typeof SmellSchema>;
export type EntryPoint = z.infer<typeof EntryPointSchema>;
export type TestAssertion = z.infer<typeof TestAssertionSchema>;
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type CodeGraph = z.infer<typeof CodeGraphSchema>;
