import { describe, expect, it } from "vitest";
import { listAssetFiles, unlicensedArtSources, unlicensedAssets, unlicensedGrammars } from "./license-check.ts";

describe("asset license check", () => {
  it("finds the Kenney placeholder files", () => {
    expect(listAssetFiles()).toEqual(
      expect.arrayContaining(["kenney/tiny-dungeon/License.txt", "kenney/tiny-dungeon/tilemap_packed.png"]),
    );
  });

  it("finds a license entry for every asset", () => {
    expect(unlicensedAssets()).toEqual([]);
    expect(unlicensedArtSources()).toEqual([]);
    expect(unlicensedGrammars()).toEqual([]);
  });
});
