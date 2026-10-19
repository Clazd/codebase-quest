import { describe, expect, it } from "vitest";
import { checkWorldgenRng, rngViolations } from "./check-worldgen-rng.ts";

describe("worldgen RNG lint", () => {
  it("rejects direct and computed references including aliases", async () => {
    expect(await rngViolations('const f = Math.random; Math["random"]();')).toEqual([1, 1]);
  });
  it("ignores comments and strings and accepts the current package", async () => {
    expect(await rngViolations('/* Math.random() */ const text="Math.random()"; Math.floor(1);')).toEqual([]);
    await expect(checkWorldgenRng()).resolves.toBeUndefined();
  });
});
