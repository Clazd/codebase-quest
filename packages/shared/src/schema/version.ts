import { z } from "zod";

/**
 * The version of every persisted or exchanged data contract (CodeGraph,
 * WorldModel, CodeBody, saves…). Bump it only with a migration and an ADR.
 */
export const SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

/**
 * Wraps an object schema so the document carries `schemaVersion: 1`.
 * Every top-level contract in later phases is built with this helper.
 */
export function versioned<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({ schemaVersion: SchemaVersionSchema, ...shape });
}
