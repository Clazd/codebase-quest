import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/combat", () => {
  it("exports the Phase 07 engine", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/combat", phase: 7, status: "engine" });
  });
});
