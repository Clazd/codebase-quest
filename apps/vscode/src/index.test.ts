import { describe, expect, it } from "vitest";
import { packageInfo } from "./index.ts";

describe("@codebase-quest/vscode", () => {
  it("is a placeholder until Phase 15", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/vscode", phase: 15, status: "placeholder" });
  });
});
