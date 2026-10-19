/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { expect, it } from "vitest";
import { parse } from "./ast.ts";
import { buildBody } from "./body.ts";
import { mutate } from "./mutation.ts";

for (const [operator, statement] of [
  ["flip-comparison", "if (a > 1) { const b = a; }"],
  ["swap-logic", "if (a && b) { const c = a; }"],
  ["remove-not", "if (!a) { const c = a; }"],
  ["plus-minus", "const c = a + 1;"],
  ["swap-args", "call(a, b);"],
  ["return-null", "return a;"],
] as const)
  it(`injects ${operator} deterministically and leaves valid syntax`, async () => {
    const source = `function sample(a, b) {\n${statement}\n}`;
    const root = await parse(source, "typescript");
    const b = buildBody({
      definition: root.namedChildren[0]!,
      symbolId: "sample",
      name: "sample",
      path: "sample.ts",
      language: "typescript",
      fileLines: source.split("\n"),
      edges: [],
    });
    const m = await mutate(b, source, "typescript");
    expect(m).toBeTruthy();
    expect(m!.operator).toBe(operator);
    expect(m).toEqual(await mutate(b, source, "typescript"));
    expect(m!.original).not.toBe(m!.mutated);
    expect(m).toMatchSnapshot();
    const changed = source.split("\n");
    changed[m!.line - 1] = m!.mutated;
    expect((await parse(changed.join("\n"), "typescript")).hasError).toBe(false);
    expect(changed.filter((line, i) => line !== source.split("\n")[i])).toHaveLength(1);
  });
