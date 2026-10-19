import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/asset-pipeline", () => {
  it("is a placeholder until Phase 01", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/asset-pipeline", phase: 1, status: "placeholder" });
  });
});
