import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/server", () => {
  it("is a placeholder until Phase 13", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/server", phase: 13, status: "placeholder" });
  });
});
