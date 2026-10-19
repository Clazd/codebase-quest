import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/multiplayer", () => {
  it("is a placeholder until Phase 14", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/multiplayer", phase: 14, status: "placeholder" });
  });
});
