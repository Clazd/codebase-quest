/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { expect, it } from "vitest";
import { parse } from "./ast.ts";
import { buildBody } from "./body.ts";
import { evaluate, NotEvaluable } from "./evaluator.ts";
import { assertionInputs, evaluatorInputs, trace } from "./inputs.ts";

async function expression(text: string) {
  const root = await parse(`const result = ${text};`, "typescript");
  return root.namedChildren[0]!.namedChildren.find((n) => n?.type === "variable_declarator")!.childForFieldName(
    "value",
  )!;
}
for (const [text, expected] of [
  ["1 < 2", true],
  ["2 <= 2", true],
  ["2 > 2", false],
  ["3 >= 2", true],
  ["true === false", false],
  ["null == undefined", true],
  ["null != undefined", false],
  ['"a" !== "b"', true],
  ["!false", true],
  ["false && unknown()", false],
  ["true || unknown()", true],
  ["true ? 4 : unknown()", 4],
  ["null ?? 2", 2],
  ["[1, 2].length", 2],
  ['"abc".length', 3],
  ["({a: {b: true}}).a.b", true],
  ["[4,5][1]", 5],
  ["-2 < 0", true],
  ["({a: 1}).absent", undefined],
] as const)
  it(`evaluates ${text}`, async () => expect(evaluate(await expression(text), new Map())).toEqual(expected));
it("rejects all unsupported expressions without executing them", async () => {
  for (const text of [
    "Date.now()",
    "fetch('bad')",
    "x++",
    "x = 2",
    "1 + 2",
    "globalThis",
    "new Date()",
    "({}).constructor",
    "({__proto__: {x: 1}})",
    "({a: 1}) === ({a: 1})",
    "1 == '1'",
    "'2' > 1",
    "({x: undefined})?.x.y",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: This is source data for a rejected template expression.
    "`x${1}`",
  ]) {
    const node = await expression(text);
    expect(() => evaluate(node, new Map())).toThrow(NotEvaluable);
  }
});
async function made(text: string) {
  const root = await parse(text, "typescript");
  return buildBody({
    definition: root.namedChildren[0]!,
    symbolId: "f",
    name: "f",
    path: "f.ts",
    language: "typescript",
    fileLines: text.split("\n"),
    edges: [],
  });
}
it("keeps boundary inputs only when every reached statement is evaluable", async () => {
  const b = await made('function f(x) {\nif (x >= 10) return "high";\nreturn "low";\n}');
  const inputs = evaluatorInputs(b, new Map());
  expect(inputs.map((i) => i.args[0])).toEqual([10, 9]);
  expect(inputs.map((i) => i.exitHeartId)).toEqual(["c2", "c3"]);
});
it("refuses unsafe paths including alias mutation, try/finally and defaults", async () => {
  for (const source of [
    "function f(x) { unknown(x); return 1; }",
    "function f(x) { x.ok = false; return x.ok; }",
    "function f(x) { const y = unknown(); return 1; }",
    "function f(x) { try { return 1; } finally { return 2; } }",
    "function f(x) { while(x) {} return 0; }",
    "function f(x = 1) { return x; }",
  ]) {
    const b = await made(source);
    expect(() => trace(b, [true], new Map())).toThrow(NotEvaluable);
  }
});
it("uses Python truthiness and literal len without executing calls", async () => {
  for (const [code, value] of [
    ["not []", true],
    ["len([1, 2])", 2],
    ["len('😀')", 1],
    ["not {}", true],
  ] as const) {
    const root = await parse(`x = ${code}`, "python");
    const expr = root.namedChildren[0]!.namedChildren[0]!.childForFieldName("right")!;
    expect(evaluate(expr, new Map())).toBe(value);
  }
});
it("uses unique literal assertion exits only and refuses ambiguous expected returns", async () => {
  const b = await made('function f(x) {\nunknown();\nif(x) return "yes";\nreturn "no";\n}');
  const assertion = {
    id: "t",
    calleeSymbolId: "f",
    testFileId: "test",
    line: 1,
    args: [true],
    expected: "yes",
    matcher: "equal",
  } as const;
  expect(assertionInputs(b, [{ ...assertion, args: [true] }], new Map(), () => "test.ts")[0]?.pathCellIds).toEqual([
    "c3",
  ]);
  const duplicate = await made('function f(x) {\nunknown();\nif(x) return "same";\nreturn "same";\n}');
  expect(
    assertionInputs(duplicate, [{ ...assertion, args: [true], expected: "same" }], new Map(), () => "test.ts"),
  ).toEqual([]);
});
