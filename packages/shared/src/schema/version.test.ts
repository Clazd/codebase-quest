import { describe, expect, it } from "vitest";
import {
  LiteralValueSchema,
  PlaceholderDocumentSchema,
  PositionSchema,
  SCHEMA_VERSION,
  SchemaVersionSchema,
} from "../index.ts";

describe("schema versioning", () => {
  it("starts at version 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("accepts only the current version", () => {
    expect(SchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(SchemaVersionSchema.safeParse(2).success).toBe(false);
  });

  it("requires schemaVersion on versioned documents", () => {
    expect(PlaceholderDocumentSchema.parse({ schemaVersion: 1, kind: "placeholder" })).toEqual({
      schemaVersion: 1,
      kind: "placeholder",
    });
    expect(PlaceholderDocumentSchema.safeParse({ kind: "placeholder" }).success).toBe(false);
  });
});

describe("placeholder schemas", () => {
  it("parses positions", () => {
    expect(PositionSchema.parse({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    expect(PositionSchema.safeParse({ x: "3", y: 4 }).success).toBe(false);
  });

  it("parses nested literal values", () => {
    const value = { done: true, doneAt: 20, dueDate: 10, tags: ["a", null] };
    expect(LiteralValueSchema.parse(value)).toEqual(value);
    expect(LiteralValueSchema.safeParse({ fn: () => 1 }).success).toBe(false);
  });
});
