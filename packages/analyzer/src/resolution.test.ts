import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { discover } from "./discover.ts";
import { analyze } from "./index.ts";

// Temporary test directories deliberately live outside analyzed projects.
function project(files: Record<string, string>, git = false): string {
  const root = mkdtempSync(join(tmpdir(), "cq-analyzer-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  if (git) execFileSync("git", ["-C", root, "init", "--quiet"]);
  return root;
}
describe("resolution and security boundaries", () => {
  it("resolves aliases, index files, reexports and namespace calls with honest confidence", async () => {
    const root = project({
      "tsconfig.json": '{// comments are valid\n"compilerOptions":{"baseUrl":".","paths":{"@lib/*":["lib/*"]}}}',
      "lib/real.ts": "export function callee(x: number) { return x; }",
      "lib/index.ts": 'export { callee as publicName } from "./real";',
      "use.ts":
        'import {publicName as named} from "@lib/index"; import * as space from "./lib/real"; export function run() { named(1); space.callee(2); }',
    });
    const g = await analyze(root, { workers: 1 });
    const target = g.symbols.find((s) => s.name === "callee");
    const run = g.symbols.find((s) => s.name === "run");
    expect(g.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: run?.id, to: target?.id, confidence: "exact", kind: "calls" }),
        expect.objectContaining({ from: run?.id, to: target?.id, confidence: "likely", kind: "calls" }),
      ]),
    );
  });
  it("never resolves shadowed bindings, arbitrary receiver methods or computed calls as exact", async () => {
    const root = project({
      "target.ts": "export function target() { return 1; }",
      "use.ts":
        'import { target } from "./target"; function f(target: () => number, obj: any, key: string) { target(); obj.target(); obj[key](); } function g() { const target = unknownValue; target(); }',
    });
    const g = await analyze(root, { workers: 1 });
    expect(g.edges.filter((e) => e.kind === "calls")).toEqual([]);
    expect(g.symbols.find((s) => s.name === "f")?.metrics.dynamicCalls).toBeGreaterThanOrEqual(3);
  });
  it("links this/self methods, inheritance and recursion", async () => {
    const root = project({
      "a.ts": "export class Base {} export class Child extends Base { method() { this.method(); } }",
      "b.py": "class A:\n    def f(self):\n        self.f()\n",
    });
    const g = await analyze(root, { workers: 1 });
    expect(g.edges.some((e) => e.kind === "extends" && e.confidence === "exact")).toBe(true);
    for (const name of ["Child.method", "A.f"])
      expect(g.symbols.find((s) => s.qualifiedName === name)?.traits).toContain("recursive");
  });
  it("resolves Python package modules and relative imports", async () => {
    const root = project({
      "pkg/__init__.py": "",
      "pkg/helper.py": "def foo():\n    return 1\n",
      "pkg/main.py": "from .helper import foo as bar\nfrom . import helper\ndef main():\n    bar()\n    helper.foo()\n",
    });
    const g = await analyze(root, { workers: 1 });
    expect(
      g.edges
        .filter((e) => e.kind === "calls")
        .map((e) => e.confidence)
        .sort(),
    ).toEqual(["exact", "likely"]);
  });
  it("uses git ignore rules and keeps non-git folders usable", async () => {
    for (const git of [true, false]) {
      const root = project(
        {
          ".gitignore": "ignored/\n",
          "ignored/omit.ts": "export function omit() {}",
          "keep.ts": "export function keep() {}",
          "node_modules/skip.ts": "broken",
        },
        git,
      );
      const g = await analyze(root, { workers: 1 });
      expect(g.files.map((f) => f.path)).toEqual(expect.arrayContaining(["keep.ts"]));
      expect(g.files.some((f) => f.path.includes("omit") || f.path.includes("node_modules"))).toBe(false);
      expect(g.diagnostics.some((d) => d.code === "no-git")).toBe(!git);
    }
  });
  it("does not read credential files, even for sniffing, and masks documentation", async () => {
    const root = project({
      ".env": "secret-must-not-be-read",
      "credentials.json": "secret-must-not-be-read",
      "README.md": 'api_key="sensitive123"',
      "source.ts": "export function f() { return 1; }",
    });
    const reads: string[] = [];
    const d = discover(root, (path) => {
      reads.push(path);
      return readFileSync(path);
    });
    expect(reads.some((path) => /\.env|credentials\.json/.test(path))).toBe(false);
    expect(d.diagnostics.filter((d) => d.code === "secret-skipped")).toHaveLength(2);
    const g = await analyze(root, { workers: 1 });
    expect(JSON.stringify(g)).not.toContain("sensitive123");
    expect(JSON.stringify(g)).not.toContain("secret-must-not-be-read");
    expect(readFileSync(join(root, "source.ts"), "utf8")).toContain("export function f");
  });
  it("records dynamic assertions and does not run hostile repository code", async () => {
    const root = project({
      "package.json": '{"main":"index.js","scripts":{"preinstall":"must-never-run"}}',
      "index.js": 'throw new Error("NEVER_EXECUTE_ME"); export function f(x) { return x; }',
      "test_x.js": 'import {f} from "./index.js"; assert.equal(f(1), 1);',
    });
    const g = await analyze(root, { workers: 1 });
    expect(g.entryPoints.some((e) => e.kind === "main")).toBe(true);
    expect(g.symbols.some((s) => s.name === "f")).toBe(true);
  });
});
