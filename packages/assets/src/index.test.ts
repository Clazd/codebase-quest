import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tinyDungeon } from "./index.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("@codebase-quest/assets", () => {
  it("has a license entry for the Kenney tilemap", () => {
    const licenses = readFileSync(`${packageRoot}/LICENSES.md`, "utf8");
    expect(licenses).toContain(tinyDungeon.sheet);
    expect(licenses).toContain("CC0");
  });

  it("describes a sheet whose PNG size matches its grid", () => {
    const png = readFileSync(`${packageRoot}/${tinyDungeon.sheet}`);
    // PNG IHDR: width at byte 16, height at byte 20 (big-endian).
    expect(png.readUInt32BE(16)).toBe(tinyDungeon.columns * tinyDungeon.tileSize);
    expect(png.readUInt32BE(20)).toBe(tinyDungeon.rows * tinyDungeon.tileSize);
    for (const frame of Object.values(tinyDungeon.frames)) {
      expect(frame).toBeLessThan(tinyDungeon.columns * tinyDungeon.rows);
    }
  });
});
