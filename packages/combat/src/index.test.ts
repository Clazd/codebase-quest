import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/combat", () => {
  it("is a placeholder until Phase 07", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/combat", phase: 7, status: "placeholder" });
  });
});
