import { z } from "zod";
import { versioned } from "./version.ts";

// Placeholder schemas. The real contracts (MASTER-PLAN §16.4) arrive with the
// phases that produce them: CodeGraph (02), WorldModel (03), CodeBody (07).

/** A pixel or tile position. */
export const PositionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof PositionSchema>;

/** A literal value as it appears in code or test assertions. */
export type LiteralValue = string | number | boolean | null | LiteralValue[] | { [key: string]: LiteralValue };

export const LiteralValueSchema: z.ZodType<LiteralValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(LiteralValueSchema),
    z.record(z.string(), LiteralValueSchema),
  ]),
);

/** Smallest valid versioned document; used to test the versioning helper. */
export const PlaceholderDocumentSchema = versioned({ kind: z.literal("placeholder") });
export type PlaceholderDocument = z.infer<typeof PlaceholderDocumentSchema>;
