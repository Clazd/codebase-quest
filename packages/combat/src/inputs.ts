import type { LiteralValue, TestAssertion } from "@codebase-quest/shared";
import type { Node } from "web-tree-sitter";
import { identifiers, type Stmt } from "./ast.ts";
import type { BuiltBody } from "./body.ts";
import { type Env, evaluate, NotEvaluable, same, show, truthy, type Value } from "./evaluator.ts";
import type { BodyInput } from "./schema.ts";

/** Module-level `const NAME = <literal>` (and Python `NAME = literal`): constants the evaluator may read. */
export function moduleConstants(root: Node): Map<string, Value> {
  const env = new Map<string, Value>();
  const empty = new Map<string, Value>();
  for (const child of root.namedChildren) {
    if (!child) continue;
    const decl =
      child.type === "export_statement" ? child.namedChildren.find((c) => c?.type === "lexical_declaration") : child;
    if (decl?.type === "lexical_declaration" && decl.text.startsWith("const")) {
      for (const d of decl.namedChildren) {
        const name = d?.childForFieldName("name"),
          value = d?.childForFieldName("value");
        if (name?.type !== "identifier" || !value) continue;
        try {
          const literal = evaluate(value, empty);
          if (literal === null || typeof literal !== "object") env.set(name.text, literal);
        } catch {}
      }
    }
    if (child.type === "expression_statement") {
      const a = child.namedChildren[0];
      const left = a?.childForFieldName("left"),
        right = a?.childForFieldName("right");
      if (a?.type === "assignment" && left?.type === "identifier" && /^[A-Z][A-Z0-9_]*$/.test(left.text) && right)
        try {
          env.set(left.text, evaluate(right, empty));
        } catch {}
    }
  }
  return env;
}
export type Outcome = { exit: string; value: Value | typeof UNKNOWN; path: string[] };
export const UNKNOWN = Symbol("unknown");
/** Constants safe to use without executing a function or resolving locals. */
export function literalConstants(built: BuiltBody, constants: ReadonlyMap<string, Value>): Map<string, Value> {
  const env = new Map(constants);
  for (const declaration of built.definition.descendantsOfType(["variable_declarator", "assignment"])) {
    const name = declaration.childForFieldName("name") ?? declaration.childForFieldName("left");
    if (name) for (const identifier of identifiers(name)) env.delete(identifier.text);
  }
  for (const parameter of built.body.params) env.delete(parameter);
  return env;
}
/**
 * Runs the statement tree on literal inputs with the safe evaluator. Returns the
 * exit heart and path, or throws NotEvaluable as soon as anything on the path
 * leaves the safe subset (calls in conditions, loops, unknown locals…).
 */
export function trace(built: BuiltBody, args: readonly LiteralValue[], constants: ReadonlyMap<string, Value>): Outcome {
  if (built.body.cells.some((c) => c.grouped)) throw new NotEvaluable("grouped path");
  if (built.body.params.length !== args.length) throw new NotEvaluable("missing/default/destructured arguments");
  if (
    built.definition
      .descendantsOfType(["required_parameter", "optional_parameter", "rest_pattern", "assignment_pattern"])
      .some((n) => n.childForFieldName("value") || n.type === "rest_pattern" || n.type === "assignment_pattern")
  )
    throw new NotEvaluable("default/rest parameter");
  const env = new Map<string, Value>(constants);
  built.body.params.forEach((p, i) => {
    env.set(p, args[i] as Value);
  });
  const path: string[] = [];
  const visit = (id: string | undefined) => {
    if (id && !path.includes(id)) path.push(id);
  };
  const scope = () => {
    const view = new Map(env);
    return view as Env;
  };
  function run(list: Stmt[]): Outcome | null {
    const saved = new Map(env);
    try {
      for (const stmt of list) {
        const cell = built.cellOf.get(stmt);
        if (stmt.kind === "break") throw new NotEvaluable("break");
        if (stmt.kind === "loop" || stmt.kind === "switch") throw new NotEvaluable(stmt.kind);
        visit(cell);
        if (stmt.kind === "if") {
          const taken = truthy(evaluate(stmt.cond, scope()), built.body.language === "python")
            ? stmt.consequent
            : stmt.else;
          if (taken) {
            const out = run(taken);
            if (out) return out;
          }
        } else if (stmt.kind === "try") {
          throw new NotEvaluable("exception control flow");
        } else if (stmt.kind === "return" || stmt.kind === "throw") {
          if (!cell) throw new NotEvaluable("grouped exit");
          let value: Value | typeof UNKNOWN = UNKNOWN;
          if (stmt.kind !== "return") throw new NotEvaluable("throw");
          value = stmt.value ? evaluate(stmt.value, scope()) : undefined;
          return { exit: cell, value, path };
        } else if (stmt.kind === "decl") {
          if (stmt.node.text.startsWith("var ") || stmt.names.length !== 1)
            throw new NotEvaluable("unsupported binding");
          for (const name of stmt.names) {
            try {
              if (!stmt.value) throw new NotEvaluable("no value");
              env.set(name, evaluate(stmt.value, scope()));
            } catch {
              throw new NotEvaluable("unsupported declaration");
            }
          }
        } else throw new NotEvaluable("unsupported statement or mutation");
      }
      return null;
    } finally {
      if (built.body.language !== "python") {
        env.clear();
        for (const [name, value] of saved) env.set(name, value);
      }
    }
  }
  const out = run(built.stmts);
  if (!out) throw new NotEvaluable("falls off the end");
  return out;
}
const hearts = (built: BuiltBody) => built.body.cells.filter((c) => c.kind === "heart");
/** Literal return value of each heart, when it is a literal (`return "late"`). */
export function heartLiterals(built: BuiltBody, constants: ReadonlyMap<string, Value>): Map<string, Value> {
  const out = new Map<string, Value>();
  for (const h of hearts(built)) {
    const stmt = built.stmtOf.get(h.id);
    if (stmt?.kind !== "return" || !stmt.value) continue;
    try {
      out.set(h.id, evaluate(stmt.value, literalConstants(built, constants)));
    } catch {}
  }
  return out;
}
const telegraphOf = (built: BuiltBody, args: readonly LiteralValue[]) =>
  `${built.body.name}(${args.map((a) => show(a as Value)).join(", ")})`;
/**
 * Body inputs from test assertions: the path when the evaluator can follow it;
 * otherwise only the exit, when the expected value equals exactly one heart's literal.
 */
export function assertionInputs(
  built: BuiltBody,
  assertions: readonly TestAssertion[],
  constants: ReadonlyMap<string, Value>,
  testPath: (fileId: string) => string,
): BodyInput[] {
  const literals = heartLiterals(built, constants);
  const out: BodyInput[] = [];
  for (const a of [...assertions].sort((x, y) => x.line - y.line || (x.id < y.id ? -1 : 1))) {
    if (a.calleeSymbolId !== built.body.symbolId) continue;
    const evidence = `${testPath(a.testFileId)}:${a.line}`;
    let path: string[] | null = null;
    let exit: string | null = null;
    try {
      const o = trace(built, a.args, constants);
      // A traced path must agree with the assertion when its value is known.
      if (o.value !== UNKNOWN && !same(o.value, a.expected as Value)) continue;
      path = o.path;
      exit = o.exit;
    } catch (error) {
      if (!(error instanceof NotEvaluable)) throw error;
      const matching = [...literals].filter(([, v]) => same(v, a.expected as Value)).map(([id]) => id);
      if (matching.length !== 1) continue;
      exit = matching[0] ?? null;
      path = exit ? [exit] : null;
    }
    if (!exit || !path) continue;
    if (out.some((i) => i.exitHeartId === exit && i.pathCellIds.join() === path?.join())) continue;
    out.push({
      id: `t${out.length + 1}`,
      args: a.args,
      telegraph: telegraphOf(built, a.args),
      pathCellIds: path,
      exitHeartId: exit,
      source: "test-assertion",
      evidence,
    });
  }
  return out;
}
/** Conditions of every `if`/loop-free branch in the body, in source order. */
function conditions(built: BuiltBody): Node[] {
  const conds: Node[] = [];
  const collect = (list: Stmt[]) => {
    for (const s of list) {
      if (s.kind === "if") {
        conds.push(s.cond);
        collect(s.consequent);
        if (s.else) collect(s.else);
      } else if (s.kind === "try") collect(s.body);
    }
  };
  collect(built.stmts);
  return conds;
}
const BOOLEAN_PARENTS = new Set([
  "unary_expression",
  "not_operator",
  "boolean_operator",
  "ternary_expression",
  "conditional_expression",
]);
/**
 * `a.b.c` member chains on parameters in conditions → candidate values: the
 * literal they are compared with (and its neighbors), or true/false where the
 * chain itself is used as a boolean. `x.length` chains become arrays of that size.
 */
function candidates(
  built: BuiltBody,
  constants: ReadonlyMap<string, Value>,
  conds: readonly Node[],
): Map<string, Value[]> {
  const out = new Map<string, Value[]>();
  const add = (path: string, v: Value) => {
    if (path.endsWith(".length") && (typeof v !== "number" || v < 0 || v > 20 || !Number.isInteger(v))) return;
    const list = out.get(path) ?? [];
    if (!list.some((x) => same(x, v))) list.push(v);
    out.set(path, list);
  };
  const params = new Set(built.body.params);
  const chain = (n: Node): string | null => {
    if (n.type === "identifier") return params.has(n.text) ? n.text : null;
    if (n.type === "member_expression" || n.type === "attribute") {
      const obj = n.childForFieldName("object"),
        prop = n.childForFieldName("property") ?? n.childForFieldName("attribute");
      const base = obj ? chain(obj) : null;
      return base && prop ? `${base}.${prop.text}` : null;
    }
    if (n.type === "parenthesized_expression") return chain(n.namedChildren[0] as Node);
    return null;
  };
  const visit = (n: Node, root: boolean) => {
    if (n.type === "binary_expression" || n.type === "comparison_operator") {
      const op = n.childForFieldName("operator")?.text ?? "";
      if (!["&&", "||", "??", "and", "or"].includes(op)) {
        const [l, r] = [
          n.childForFieldName("left") ?? n.namedChildren[0],
          n.childForFieldName("right") ?? n.namedChildren[1],
        ];
        for (const [side, other] of [
          [l, r],
          [r, l],
        ] as const) {
          const path = side ? chain(side) : null;
          if (!path || !other) continue;
          try {
            const v = evaluate(other, constants);
            add(path, v);
            if (typeof v === "number") for (const d of [-1, 1]) add(path, v + d);
            if (typeof v === "string") add(path, v === "" ? "x" : "");
            if (v === null) add(path, path.endsWith(".length") ? 1 : "x");
          } catch {}
        }
        for (const c of n.namedChildren) if (c && !chain(c)) visit(c, false);
        return;
      }
    }
    const path = chain(n);
    if (
      path &&
      (root ||
        BOOLEAN_PARENTS.has(n.parent?.type ?? "") ||
        ["&&", "||", "and", "or"].includes(n.parent?.childForFieldName("operator")?.text ?? ""))
    ) {
      add(path, true);
      add(path, false);
      return;
    }
    for (const c of n.namedChildren) if (c) visit(c, false);
  };
  for (const c of conds) visit(c, true);
  return out;
}
function setPath(args: Value[], params: readonly string[], path: string, value: Value): Value[] {
  const [root, ...rest] = path.split(".");
  const index = params.indexOf(root ?? "");
  if (index < 0) return args;
  const next = structuredClone(args);
  // `items.length = 3` means "items is an array of three entries".
  const keys = rest.at(-1) === "length" && typeof value === "number" ? rest.slice(0, -1) : rest;
  const leaf: Value = keys !== rest ? Array.from({ length: value as number }, () => null) : value;
  if (!keys.length) {
    next[index] = leaf;
    return next;
  }
  let obj = next[index];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    obj = {};
    next[index] = obj;
  }
  let cursor = obj as Record<string, Value>;
  keys.forEach((key, i) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new NotEvaluable("unsafe candidate key");
    if (i === keys.length - 1) cursor[key] = leaf;
    else {
      const child = cursor[key];
      cursor[key] = typeof child === "object" && child !== null && !Array.isArray(child) ? child : {};
      cursor = cursor[key] as Record<string, Value>;
    }
  });
  return next;
}
/** Base input (every path at its first candidate) plus one-path-at-a-time variations. */
function variations(
  params: readonly string[],
  cands: Map<string, Value[]>,
): { args: Value[]; assignments: [string, Value][] }[] {
  const paths = [...cands.keys()].sort();
  let base: Value[] = params.map(() => null);
  const baseAssign: [string, Value][] = [];
  for (const p of paths) {
    const v = cands.get(p)?.[0] as Value;
    base = setPath(base, params, p, v);
    baseAssign.push([p, v]);
  }
  const out = [{ args: base, assignments: baseAssign }];
  for (const p of paths)
    for (const v of (cands.get(p) ?? []).slice(1))
      out.push({
        args: setPath(base, params, p, v),
        assignments: baseAssign.map(([k, x]) => [k, k === p ? v : x] as [string, Value]),
      });
  return out;
}
/** Candidate literal argument lists for the whole body (base input plus boundary variations). */
export function candidateInputs(built: BuiltBody, constants: ReadonlyMap<string, Value>): LiteralValue[][] {
  const cands = candidates(built, constants, conditions(built));
  return cands.size ? (variations(built.body.params, cands).map((v) => v.args) as LiteralValue[][]) : [];
}
/**
 * Inputs for one condition only: just the fields that condition reads, as
 * `path = value` assignments (what Path Finder shows the player).
 */
export function conditionInputs(
  built: BuiltBody,
  constants: ReadonlyMap<string, Value>,
  cond: Node,
): { args: LiteralValue[]; assignments: [string, Value][] }[] {
  const cands = candidates(built, literalConstants(built, constants), [cond]);
  return cands.size
    ? (variations(built.body.params, cands) as { args: LiteralValue[]; assignments: [string, Value][] }[])
    : [];
}
/**
 * Evaluator inputs: boundary values from the literals in conditions (e.g. 10 → 9, 10, 11),
 * varied one at a time from a base input, kept only when the whole path is evaluable.
 * Parameters no condition mentions stay null (a literal), so the input remains printable.
 */
export function evaluatorInputs(built: BuiltBody, constants: ReadonlyMap<string, Value>, limit = 6): BodyInput[] {
  const tries = candidateInputs(built, constants);
  const out: BodyInput[] = [];
  for (const args of tries) {
    let o: Outcome;
    try {
      o = trace(built, args as LiteralValue[], constants);
    } catch {
      continue;
    }
    if (out.some((i) => i.pathCellIds.join() === o.path.join())) continue;
    out.push({
      id: `e${out.length + 1}`,
      args: args as LiteralValue[],
      telegraph: telegraphOf(built, args as LiteralValue[]),
      pathCellIds: o.path,
      exitHeartId: o.exit,
      source: "evaluator",
      evidence: `${built.body.path}:${built.body.code.startLine} (safe evaluator)`,
    });
    if (out.length >= limit) break;
  }
  return out;
}
