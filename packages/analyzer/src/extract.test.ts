import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roleOf, secretPath } from "./discover.ts";
import { treeSitterExtractor } from "./extract.ts";
import { mask } from "./util.ts";

const parse = (
  text: string,
  language: "typescript" | "python" | "tsx" | "javascript" | "jsx" = "typescript",
  role: "source" | "test" = "source",
) =>
  treeSitterExtractor.extract({
    path: language === "python" ? "example.py" : "example.ts",
    text,
    language,
    role,
    loc: text.split("\n").length,
  });
describe("syntax extraction", () => {
  it("uses the pinned grammar bytes", () => {
    const hashes = JSON.parse(readFileSync(new URL("../grammars/hashes.json", import.meta.url), "utf8")) as Record<
      string,
      string
    >;
    for (const [file, expected] of Object.entries(hashes))
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(`../grammars/${file}`, import.meta.url)))
          .digest("hex"),
      ).toBe(expected);
  });
  it("extracts named arrows, expression bindings, classes, traits and accurate ranges", async () => {
    const data = await parse(
      "export const first = (a: number): number => a + 1;\nconst second = function* (x: string) { yield x; };\n/** @deprecated */\nexport class A { constructor(x: number) {} async handleClick() { this.handleClick(); } }",
    );
    expect(data.symbols.map((s) => s.qualifiedName)).toEqual([
      "first",
      "second",
      "A",
      "A.constructor",
      "A.handleClick",
    ]);
    expect(data.symbols[0]).toMatchObject({
      exported: true,
      range: { startLine: 1, endLine: 1 },
      parameters: [{ name: "a", type: "number" }],
    });
    expect(data.symbols[1]?.generator).toBe(true);
    expect(data.symbols.at(-1)?.traits).toEqual(expect.arrayContaining(["async", "event-handler"]));
  });
  it("extracts Python methods, docstrings, decorators and literal facts", async () => {
    const data = await parse(
      'class API:\n    @deprecated\n    async def on_get(self, x: int = 1) -> str:\n        """A docstring."""\n        self.on_get(x)\n        return "ok"\ndef test_value():\n    assert example({"a": [1, None, True]}) == "ok"',
      "python",
      "test",
    );
    expect(data.symbols.map((s) => s.qualifiedName)).toEqual(["API", "API.on_get", "test_value"]);
    expect(data.symbols[1]).toMatchObject({
      doc: "A docstring.",
      decorators: ["@deprecated"],
      async: true,
      returnType: "str",
    });
    expect(data.facts[0]).toMatchObject({ args: [{ a: [1, null, true] }], expected: "ok" });
  });
  for (const language of ["tsx", "javascript", "jsx"] as const)
    it(`parses ${language}`, async () => {
      const data = await parse(
        language === "javascript" ? "const f = () => 1;" : "export const View = () => <div>Hello</div>;",
        language,
      );
      expect(data.diagnostics).toEqual([]);
      expect(data.symbols).toHaveLength(1);
    });
  it("rejects calls, spreads, interpolation and sensitive values in scored assertions", async () => {
    const data = await parse(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Deliberate untrusted source syntax, never interpolated or executed.
      'it("literals",()=>{ expect(f(1, [true, null], {a: -2})).toEqual({x:"ok"}); expect(f(g())).toBe(1); expect(f({...x})).toBe(2); expect(f(`hi ${x}`)).toBe(3); expect(f({apiKey:"abc123"})).toBe(4); });',
      "typescript",
      "test",
    );
    expect(data.facts).toHaveLength(1);
    expect(data.facts[0]?.args).toEqual([1, [true, null], { a: -2 }]);
    expect(data.diagnostics.filter((d) => d.code === "assertion-skipped")).toHaveLength(4);
  });
  it("recovers malformed syntax, keeps TODO strings out of comment smells", async () => {
    expect((await parse("function f( { const = ")).diagnostics.some((d) => d.code === "parse-error")).toBe(true);
    expect((await parse('const text = "// TODO fake"; // FIXME real\n')).todoLines).toEqual([1]);
    expect((await parse('const text = "// TODO fake";')).todoLines).toEqual([]);
  });
  it("classifies roles and rejects secret paths before content access", () => {
    for (const path of [".env.example", "a/private.pem", ".aws/credentials", "tokens/credentials.json", "id_rsa.pub"])
      expect(secretPath(path)).toBe(true);
    expect(roleOf("tests/test_file.py")).toBe("test");
    expect(roleOf(".github/workflows/ci.yml")).toBe("ci");
    expect(roleOf("foo.ts", "// @generated\n")).toBe("generated");
    expect(mask('password="hello" sk-abcdefghijklmnopqrstuv')).not.toContain("hello");
  });
});
