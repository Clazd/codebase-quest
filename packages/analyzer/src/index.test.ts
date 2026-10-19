import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/analyzer", () => {
  it("is a placeholder until Phase 02", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/analyzer", phase: 2, status: "placeholder" });
  });
});
