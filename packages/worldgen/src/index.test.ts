import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/worldgen", () => {
  it("is a placeholder until Phase 03", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/worldgen", phase: 3, status: "placeholder" });
  });
});
