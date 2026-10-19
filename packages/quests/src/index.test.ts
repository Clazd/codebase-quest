import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/quests", () => {
  it("is a placeholder until Phase 08", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/quests", phase: 8, status: "placeholder" });
  });
});
