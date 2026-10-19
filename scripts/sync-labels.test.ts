import { describe, expect, it } from "vitest";
import { ghArgs, readLabels } from "./sync-labels.ts";

describe(".github/labels.json", () => {
  const labels = readLabels();
  const names = labels.map((l) => l.name);

  it("has the community labels and one label per phase", () => {
    for (const name of ["good first issue", "help wanted", "art", "audio", "docs", "language-plugin", "monster-idea"]) {
      expect(names).toContain(name);
    }
    for (let phase = 0; phase <= 17; phase++) {
      expect(names).toContain(`phase-${String(phase).padStart(2, "0")}`);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("builds gh arguments without a shell", () => {
    expect(ghArgs({ name: "good first issue", color: "7057ff", description: "Start here" })).toEqual([
      "label",
      "create",
      "good first issue",
      "--color",
      "7057ff",
      "--description",
      "Start here",
      "--force",
    ]);
  });
});
