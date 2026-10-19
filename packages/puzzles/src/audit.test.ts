/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
/** Separate oracle: reads raw syntax/graph/assertions, never calls the
 * production evaluator, input walker, answer validator or question generators
 * to decide correctness. Fixture functions are never executed. */

import { type Encounter, MONSTER_KINDS, QuestionSchema } from "@codebase-quest/combat";
import { describe, expect, it } from "vitest";
import type { Node } from "web-tree-sitter";
import { fixture } from "../../combat/src/test-fixtures.ts";

type Atom = undefined | null | boolean | number | string | Atom[] | { [key: string]: Atom };
const children = (n: Node) => n.namedChildren.filter((c): c is Node => c !== null);
const all = (n: Node): Node[] => [n, ...children(n).flatMap(all)];
const text = (v: Atom): string =>
  v === undefined
    ? "undefined"
    : typeof v === "string"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(text).join(", ")}]`
        : v !== null && typeof v === "object"
          ? `{ ${Object.entries(v)
              .map(([k, x]) => `${k}: ${text(x)}`)
              .join(", ")} }`
          : String(v);
function literal(n: Node, env: Map<string, Atom>): Atom {
  const f = (name: string) => n.childForFieldName(name)!;
  switch (n.type) {
    case "parenthesized_expression":
      return literal(children(n)[0]!, env);
    case "true":
      return true;
    case "false":
      return false;
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "number":
      return Number(n.text);
    case "string":
      return n.text.startsWith('"') ? JSON.parse(n.text) : n.text.slice(1, -1);
    case "identifier":
      if (n.text === "undefined") return undefined;
      if (env.has(n.text)) return env.get(n.text);
      throw Error(`unbound ${n.text}`);
    case "array":
      return children(n).map((c) => literal(c, env));
    case "object":
      return Object.fromEntries(
        children(n).map((p) => [p.childForFieldName("key")!.text, literal(p.childForFieldName("value")!, env)]),
      );
    case "member_expression": {
      const obj = literal(f("object"), env);
      const key = f("property").text;
      if (obj === null || obj === undefined) throw Error("null access");
      return key === "length" && (typeof obj === "string" || Array.isArray(obj))
        ? obj.length
        : (obj as Record<string, Atom>)[key];
    }
    case "subscript_expression": {
      const obj = literal(f("object"), env);
      return (obj as Record<string, Atom>)[String(literal(f("index"), env))];
    }
    case "unary_expression": {
      const op = f("operator").text;
      const arg = literal(f("argument"), env);
      if (op === "!") return !arg;
      if (op === "-") return -Number(arg);
      throw Error(op);
    }
    case "binary_expression": {
      const op = f("operator").text;
      const l = literal(f("left"), env);
      if (op === "&&") return l && literal(f("right"), env);
      if (op === "||") return l || literal(f("right"), env);
      if (op === "??") return l ?? literal(f("right"), env);
      const r = literal(f("right"), env);
      switch (op) {
        case "===":
        case "==":
          return l === r;
        case "!==":
        case "!=":
          return l !== r;
        case ">":
          return (l as number) > (r as number);
        case ">=":
          return (l as number) >= (r as number);
        case "<":
          return (l as number) < (r as number);
        case "<=":
          return (l as number) <= (r as number);
        default:
          throw Error(op);
      }
    }
    case "ternary_expression":
      return literal(literal(f("condition"), env) ? f("consequence") : f("alternative"), env);
    default:
      throw Error(`not literal: ${n.type}`);
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function constants(node: Node) {
  const env = new Map<string, Atom>();
  let root = node;
  while (root.parent) root = root.parent;
  for (const d of all(root).filter(
    (n) =>
      n.type === "variable_declarator" &&
      n.parent?.text.startsWith("const") &&
      ["program", "export_statement"].includes(n.parent.parent?.type ?? ""),
  )) {
    try {
      env.set(d.childForFieldName("name")!.text, literal(d.childForFieldName("value")!, new Map()));
    } catch {}
  }
  return env;
}
/** Follow raw syntax on an input, independently of Stmt/cellOf/trace(). */
function route(b: Fixture["bodies"] extends Map<string, infer B> ? B : never, args: Atom[]) {
  const env = constants(b.definition);
  b.body.params.forEach((p, i) => {
    env.set(p, args[i]);
  });
  const path: string[] = [];
  function visit(n: Node): { line: number; value: Atom } | null {
    if (n.type === "statement_block") {
      for (const c of children(n)) {
        const out = visit(c);
        if (out) return out;
      }
      return null;
    }
    if (n.type === "comment") return null;
    const kind = n.type === "if_statement" ? "joint" : n.type === "return_statement" ? "heart" : "body";
    const c = b.body.cells.find((c) => c.lines[0] === n.startPosition.row + 1 && c.kind === kind);
    if (c && !path.includes(c.id)) path.push(c.id);
    if (n.type === "if_statement") {
      const taken = literal(n.childForFieldName("condition")!, env)
        ? n.childForFieldName("consequence")
        : n.childForFieldName("alternative");
      return taken ? visit(taken.type === "else_clause" ? children(taken)[0]! : taken) : null;
    }
    if (n.type === "return_statement")
      return { line: n.startPosition.row + 1, value: children(n)[0] ? literal(children(n)[0]!, env) : undefined };
    if (n.type === "lexical_declaration") {
      for (const decl of children(n).filter((c) => c.type === "variable_declarator"))
        env.set(decl.childForFieldName("name")!.text, literal(decl.childForFieldName("value")!, env));
      return null;
    }
    throw Error(`oracle does not support ${n.type}`);
  }
  const exit = visit(b.definition.childForFieldName("body")!);
  if (!exit) throw Error("no exit");
  return { ...exit, path };
}
function choicesValid(data: Fixture, encounter: Encounter, q: Encounter["questions"][number]): boolean[] {
  const body =
    [...encounter.bodies, ...encounter.minions].find((b) =>
      q.cellId ? b.cells.some((c) => c.id === q.cellId) : b.symbolId === q.symbolIds[0],
    ) ?? encounter.bodies[0]!;
  const b = data.bodies.get(body.symbolId)!;
  const cell = body.cells.find((c) => c.id === q.cellId);
  const originalCell = cell
    ? b.body.cells.find((c) => c.lines[0] === cell.lines[0] && c.col === cell.col && c.kind === cell.kind)
    : undefined;
  const node = originalCell ? b.stmtOf.get(originalCell.id)?.node : undefined;
  const whole = b.definition.childForFieldName("body")!;
  const nodes = all(whole);
  const input = body.inputs.find((i) => i.id === q.inputId) ?? body.inputs.find((i) => i.exitHeartId === q.cellId);
  let correct: string;
  switch (q.type) {
    case "fill-gap": {
      if (q.source === "call-graph") {
        correct = data.graph.symbols.find((s) => s.id === q.symbolIds[1])!.name;
        break;
      }
      const line = Number(/:(\d+)$/.exec(q.evidence)![1]);
      const original = b.body.code.lines[line - b.body.code.startLine]!.trim();
      const blank = q.prompt.slice(q.prompt.indexOf("`") + 1, q.prompt.lastIndexOf("`"));
      return q.choices.map((choice) => blank.replace("_____", choice) === original);
    }
    case "path-finder": {
      const condition = node!.childForFieldName("condition")!;
      return q.choices.map((choice) => {
        // Assignment values generated for Path Finder are simple primitives or
        // arrays. Parse as data, without eval/Function/VM or fixture imports.
        const env = constants(b.definition);
        for (const m of choice.matchAll(/([\w$.]+) = (\[[^\]]*\]|"[^"]*"|true|false|null|-?[\d.]+)/g)) {
          const keys = m[1]!.split(".");
          const value = JSON.parse(m[2]!) as Atom;
          const root = keys.shift()!;
          if (!keys.length) env.set(root, value);
          else {
            const obj = (env.get(root) ?? {}) as Record<string, Atom>;
            env.set(root, obj);
            let cursor = obj;
            keys.forEach((k, i) => {
              if (i === keys.length - 1) cursor[k] = value;
              else {
                cursor[k] ??= {};
                cursor = cursor[k] as Record<string, Atom>;
              }
            });
          }
        }
        return Boolean(literal(condition, env));
      });
    }
    case "predict": {
      if (q.source === "test-assertion") {
        const assertion = data.graph.testFacts.find(
          (t) =>
            t.calleeSymbolId === body.symbolId &&
            q.evidence === `${data.graph.files.find((f) => f.id === t.testFileId)!.path}:${t.line}`,
        )!;
        correct = text(assertion.expected);
        break;
      }
      const value = node!.childForFieldName("value") ?? children(node!)[0];
      correct = text(value ? literal(value, constants(b.definition)) : undefined);
      break;
    }
    case "path": {
      const path = route(b, input!.args).path;
      correct = path.map((id) => b.body.cells.find((c) => c.id === id)!.lines[0]).join(" → ");
      break;
    }
    case "who-calls": {
      const callerIds = new Set(
        data.graph.edges.filter((e) => e.kind === "calls" && e.to === body.symbolId).map((e) => e.from),
      );
      const names = new Set(data.graph.symbols.filter((s) => callerIds.has(s.id)).map((s) => s.name));
      return q.choices.map((c) => (names.size === 0 ? c === "Nobody" : names.has(c)));
    }
    case "trace": {
      const edge = data.graph.edges
        .filter((e) => e.kind === "calls" && e.confidence === "exact" && e.from === body.symbolId)
        .sort((a, b) => a.line - b.line)[0]!;
      correct = data.graph.symbols.find((s) => s.id === edge.to)!.name;
      break;
    }
    case "order-steps": {
      const calls = nodes.filter((n) => n.type === "call_expression").sort((a, b) => a.startIndex - b.startIndex);
      if (q.prompt.includes("these calls")) {
        correct = [...new Set(calls.map((n) => `${n.childForFieldName("function")!.text.replace(/\s+/g, "")}()`))]
          .slice(0, 4)
          .join(" → ");
        break;
      }
      // Verify the source positions of every displayed statement, independently
      // of the correct index and of the production step collection.
      const normalized = whole.text.replace(/\s+/g, " ");
      return q.choices.map((choice) => {
        const positions = choice
          .split(" → ")
          .map((step) => normalized.indexOf(step.replace(/ …$/, "").replace(/\s+/g, " ")));
        return positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!));
      });
    }
    case "lost-error": {
      const t = node!.type === "catch_clause" ? node!.parent! : node!;
      const names = new Set(
        all(t.childForFieldName("body")!)
          .filter((n) => n.type === "call_expression")
          .map((n) => `${n.childForFieldName("function")!.text}()`),
      );
      return q.choices.map((c) => names.has(c));
    }
    case "type-sense":
      correct = data.graph.symbols.find((s) => s.id === cell?.calleeId)!.returnType!;
      break;
    case "mutant-hunt": {
      return q.choices.map((choice) => {
        const match = /^line (\d+): (.*)$/.exec(choice)!;
        const original = b.body.code.lines[Number(match[1]) - b.body.code.startLine]!.trim().replace(/;$/, "");
        return !original.includes(match[2]!.replace(/;$/, "").replace(/\s*\{$/, ""));
      });
    }
    case "compare": {
      const other = data.bodies.get(encounter.bodies[1]!.symbolId)!.body;
      return q.choices.map((choice) => {
        const line = Number(/^line (\d+):/.exec(choice)![1]);
        const c = b.body.cells.find((c) => c.lines[0] === line)!;
        const twin = other.cells.find((t) => t.row === c.row && t.col === c.col)!;
        return c.label !== twin.label;
      });
    }
    case "field-sense": {
      const param = /`([^`]+)`/.exec(q.prompt)![1];
      const fields = new Set(
        nodes
          .filter((n) => n.type === "member_expression" && n.childForFieldName("object")?.text === param)
          .map((n) => n.childForFieldName("property")!.text),
      );
      return q.choices.map((c) => c.split(", ").every((f) => fields.has(f)));
    }
    case "echo": {
      const param = /`([^`]+)`/.exec(q.prompt)![1];
      const lines = new Set(
        nodes
          .filter((n) => ["identifier", "shorthand_property_identifier"].includes(n.type) && n.text === param)
          .map((n) => n.startPosition.row + 1),
      );
      return q.choices.map((c) => lines.has(Number(/^line (\d+):/.exec(c)![1])));
    }
    case "maze": {
      const headers: string[] = [];
      let current = node?.parent;
      while (current && current.id !== b.definition.id) {
        if (current.type === "if_statement") {
          const condition = current.childForFieldName("condition")!;
          const clause = current.childForFieldName("alternative");
          const label = `if ${condition.text}`;
          headers.unshift(clause && node!.startIndex >= clause.startIndex ? `not (${label})` : label);
        }
        if (["for_in_statement", "for_statement", "while_statement"].includes(current.type)) {
          const block = current.childForFieldName("body")!;
          headers.unshift(current.text.slice(0, block.startIndex - current.startIndex).trim());
        }
        current = current.parent;
      }
      correct = headers.join(" ∧ ");
      break;
    }
    default:
      throw Error(`Missing independent oracle: ${q.type}`);
  }
  return q.choices.map((c) => c === correct);
}
for (const name of ["tiny-ts", "smelly-ts"])
  describe(`${name} question audit`, () => {
    it("independently re-derives every scored choice, rejects distractors and snapshots deterministic output", async () => {
      const data = await fixture(name);
      const encountered = new Set<string>();
      let count = 0;
      for (const e of data.encounters.values()) {
        expect(new Set(e.questions.map((q) => q.id)).size).toBe(e.questions.length);
        for (const q of e.questions) {
          QuestionSchema.parse(q);
          encountered.add(q.type);
          if (!q.scored) {
            expect(q.answer).toBeNull();
            continue;
          }
          const valid = choicesValid(data, e, q);
          expect(valid.filter(Boolean), `${e.name}: ${q.id} has one valid choice`).toHaveLength(1);
          expect(valid[q.answer!], `${e.name}: ${q.id} matches independent evidence`).toBe(true);
          count++;
        }
        for (const body of e.bodies)
          for (const input of body.inputs) {
            const b = data.bodies.get(body.symbolId)!;
            if (input.pathCellIds.length > 1 || input.source === "evaluator") {
              const r = route(b, input.args);
              expect(input.pathCellIds).toEqual(r.path);
              expect(body.cells.find((c) => c.id === input.exitHeartId)!.lines[0]).toBe(r.line);
            } else {
              const a = data.graph.testFacts.find(
                (t) => t.calleeSymbolId === body.symbolId && JSON.stringify(t.args) === JSON.stringify(input.args),
              )!;
              const matching = all(b.definition)
                .filter((n) => n.type === "return_statement")
                .filter((n) => {
                  try {
                    return text(literal(children(n)[0]!, new Map())) === text(a.expected);
                  } catch {
                    return false;
                  }
                });
              expect(matching).toHaveLength(1);
              expect(matching[0]!.startPosition.row + 1).toBe(
                body.cells.find((c) => c.id === input.exitHeartId)!.lines[0],
              );
            }
          }
      }
      expect(count).toBeGreaterThan(30);
      expect([...encountered].sort()).toMatchSnapshot();
      expect([...data.encounters.values()]).toMatchSnapshot();
      const again = await fixture(name);
      expect(JSON.stringify([...again.encounters])).toBe(JSON.stringify([...data.encounters]));
      if (name === "smelly-ts")
        for (const kind of MONSTER_KINDS)
          expect(
            [...data.encounters.values()].some((e) => e.kind === kind),
            kind,
          ).toBe(true);
    });
  });
