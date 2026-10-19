import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { packAtlas } from "../src/index.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: pack-atlas input-directory output-directory (must exist)");
const sprites = Object.fromEntries(
  readdirSync(input)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => [f.replace(/\.png$/, ""), PNG.sync.read(readFileSync(join(input, f)))]),
);
const packed = packAtlas(sprites);
writeFileSync(join(output, "sprites.png"), PNG.sync.write(packed.image));
writeFileSync(join(output, "sprites.json"), `${JSON.stringify(packed.atlas, null, 2)}\n`);
