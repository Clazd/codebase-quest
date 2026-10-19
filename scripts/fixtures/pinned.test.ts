import { describe, expect, it } from "vitest";
import { readPinned } from "./pinned.ts";

describe("fixtures/pinned.json", () => {
  const repos = readPinned();

  it("pins 2 TypeScript and 2 Python repositories", () => {
    expect(repos.filter((r) => r.language === "typescript")).toHaveLength(2);
    expect(repos.filter((r) => r.language === "python")).toHaveLength(2);
  });

  it("uses unique names", () => {
    expect(new Set(repos.map((r) => r.name)).size).toBe(repos.length);
  });
});
