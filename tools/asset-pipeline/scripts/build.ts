import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { packAtlas, pixelize, tileSample } from "../src/index.ts";

const raw = fileURLToPath(new URL("../../../art/blender/prototype/", import.meta.url));
const output = fileURLToPath(new URL("../../../packages/assets/prototype/", import.meta.url));
mkdirSync(output, { recursive: true });
const sprites = Object.fromEntries(
  readdirSync(raw)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((file) => [file.replace(".png", ""), pixelize(PNG.sync.read(readFileSync(`${raw}/${file}`)))]),
);
const packed = packAtlas(sprites);
writeFileSync(`${output}/sprites.png`, PNG.sync.write(packed.image));
writeFileSync(`${output}/sprites.json`, `${JSON.stringify(packed.atlas, null, 2)}\n`);
writeFileSync(`${output}/tiles.png`, PNG.sync.write(tileSample()));
console.log(`Packed ${Object.keys(sprites).length} Blender frames; generated 6 tiles.`);
