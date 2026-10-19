import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, type Node, Parser } from "web-tree-sitter";

export async function rngViolations(source: string): Promise<number[]> {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(
    await Language.load(
      fileURLToPath(new URL("../packages/analyzer/grammars/tree-sitter-typescript.wasm", import.meta.url)),
    ),
  );
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    throw new Error("RNG lint parser failed");
  }
  const lines: number[] = [];
  function visit(node: Node) {
    if (["member_expression", "subscript_expression"].includes(node.type)) {
      const object = node.childForFieldName("object");
      const property = node.childForFieldName("property") ?? node.childForFieldName("index");
      if (object?.text === "Math" && ["random", '"random"', "'random'"].includes(property?.text ?? ""))
        lines.push(node.startPosition.row + 1);
    }
    for (const child of node.namedChildren) visit(child);
  }
  try {
    visit(tree.rootNode);
    return lines;
  } finally {
    tree.delete();
    parser.delete();
  }
}
export async function checkWorldgenRng(): Promise<void> {
  const root = new URL("../packages/worldgen/src/", import.meta.url);
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true }).filter(
    (e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"),
  )) {
    const path = join(entry.parentPath, entry.name);
    const file = relative(fileURLToPath(root), path);
    const lines = await rngViolations(readFileSync(path, "utf8"));
    if (lines.length)
      throw new Error(
        `worldgen RNG lint: ${file}:${lines.join(",")} references Math.random; pass the seeded RNG instead.`,
      );
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await checkWorldgenRng();
