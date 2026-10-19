import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { PALETTE, packAtlas, pixelize, tileSample } from "./index.ts";

describe("@codebase-quest/asset-pipeline", () => {
  it("thresholds alpha, snaps color and adds exactly one exterior pixel", () => {
    const input = new PNG({ width: 5, height: 5 });
    input.data.set([180, 240, 220, 200], (2 * 5 + 2) * 4);
    input.data.set([255, 0, 0, 127], 0);
    const result = pixelize(input);
    expect(result.data[3]).toBe(0);
    expect(result.data[(2 * 5 + 2) * 4 + 3]).toBe(255);
    expect(result.data[(2 * 5 + 1) * 4 + 3]).toBe(255);
    expect(result.data[(2 * 5 + 0) * 4 + 3]).toBe(0);
    expect([...result.data].filter((_, i) => i % 4 === 3 && result.data[i] === 255)).toHaveLength(5);
    const allowed = new Set(PALETTE.map((c) => c.join(",")));
    for (let i = 0; i < result.data.length; i += 4)
      if (result.data[i + 3]) expect(allowed.has([...result.data.subarray(i, i + 3)].join(","))).toBe(true);
  });
  it("packs in stable name order, checks frame size and matches committed output", () => {
    const raw = new URL("../../../art/blender/prototype/", import.meta.url);
    const files = readdirSync(raw)
      .filter((f) => f.endsWith(".png"))
      .sort();
    expect(files).toHaveLength(32);
    const sprites = Object.fromEntries(
      files.map((f) => [f.replace(".png", ""), pixelize(PNG.sync.read(readFileSync(new URL(f, raw))))]),
    );
    const a = packAtlas(sprites);
    const b = packAtlas(Object.fromEntries(Object.entries(sprites).reverse()));
    expect(PNG.sync.write(a.image)).toEqual(PNG.sync.write(b.image));
    expect(a.atlas).toEqual(b.atlas);
    const output = new URL("../../../packages/assets/prototype/", import.meta.url);
    expect(JSON.parse(readFileSync(new URL("sprites.json", output), "utf8"))).toEqual(a.atlas);
    expect(PNG.sync.read(readFileSync(new URL("sprites.png", output))).data).toEqual(a.image.data);
    for (const { frame } of Object.values(a.atlas.frames)) {
      expect(frame.x + frame.w).toBeLessThanOrEqual(a.image.width);
      expect(frame.y + frame.h).toBeLessThanOrEqual(a.image.height);
    }
    expect(() => packAtlas({ a: new PNG({ width: 1, height: 1 }), b: new PNG({ width: 2, height: 1 }) })).toThrow();
    expect(createHash("sha256").update(a.image.data).digest("hex")).toMatchSnapshot();
  });
  it("generates deterministic, distinct tiles with a golden snapshot", () => {
    const a = tileSample(),
      b = tileSample();
    expect(a.data).toEqual(b.data);
    const hashes = Array.from({ length: 6 }, (_, tile) => {
      const data = Buffer.concat(
        Array.from({ length: 16 }, (_, y) => a.data.subarray((y * 96 + tile * 16) * 4, (y * 96 + tile * 16 + 16) * 4)),
      );
      return createHash("sha256").update(data).digest("hex");
    });
    expect(new Set(hashes).size).toBe(6);
    expect(hashes).toMatchSnapshot();
  });
});
