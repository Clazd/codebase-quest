import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { pixelize } from "../src/index.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: pixelize input.png output.png");
writeFileSync(output, PNG.sync.write(pixelize(PNG.sync.read(readFileSync(input)))));
