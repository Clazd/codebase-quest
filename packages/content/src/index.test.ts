import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/content", () => {
  it("is a placeholder until Phase 06", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/content", phase: 6, status: "placeholder" });
  });
});
