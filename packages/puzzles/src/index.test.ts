import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/puzzles", () => {
  it("is a placeholder until Phase 07", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/puzzles", phase: 7, status: "placeholder" });
  });
});
