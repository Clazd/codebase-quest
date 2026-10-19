import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/puzzles", () => {
  it("exports the Phase 07 library", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/puzzles", phase: 7, status: "library" });
  });
});
