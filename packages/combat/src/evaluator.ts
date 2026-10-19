import type { Node } from "web-tree-sitter";

/**
 * The safe evaluator (MASTER-PLAN §7.5). It interprets a tiny subset of
 * expressions over literal values: literals, names bound to literals,
 * property access on literal objects, comparisons, `!`, `&&`, `||`, ternaries,
 * and `length` / `len()` of literal strings and arrays. Calls, globals,
 * arithmetic and mutation are refused, so nothing from a repository runs.
 */
export type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value };
export class NotEvaluable extends Error {}
const no = (why: string): never => {
  throw new NotEvaluable(why);
};
const isObject = (v: Value): v is { [key: string]: Value } => typeof v === "object" && v !== null && !Array.isArray(v);
export const truthy = (v: Value, python = false): boolean =>
  Array.isArray(v) ? !python || v.length > 0 : isObject(v) ? !python || Object.keys(v).length > 0 : Boolean(v);
/** Strict equality that compares arrays and objects by value (literals have no identity). */
export function same(a: Value, b: Value): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).sort(),
      kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
  }
  return a === b;
}
function compare(op: string, a: Value, b: Value): boolean {
  switch (op) {
    case "===":
    case "==":
      if (op === "==" && (a === null || a === undefined) && (b === null || b === undefined)) return true;
      if ((a !== null && typeof a === "object") || (b !== null && typeof b === "object"))
        return no("reference equality");
      if (op === "==" && typeof a !== typeof b) return no("coercive equality");
      return a === b;
    case "!==":
    case "!=":
      if (op === "!=" && (a === null || a === undefined) && (b === null || b === undefined)) return false;
      if ((a !== null && typeof a === "object") || (b !== null && typeof b === "object"))
        return no("reference equality");
      if (op === "!=" && typeof a !== typeof b) return no("coercive equality");
      return a !== b;
    case "<":
    case "<=":
    case ">":
    case ">=": {
      const ok = (typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string");
      if (!ok) return no(`cannot order ${typeof a} and ${typeof b}`);
      const x = a as number | string,
        y = b as number | string;
      return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
    }
    default:
      return no(`operator ${op}`);
  }
}
const PY_OPS: Record<string, string> = {
  "==": "===",
  "!=": "!==",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  is: "===",
  "is not": "!==",
};
const field = (n: Node, name: string) => n.childForFieldName(name);
const kids = (n: Node) => n.namedChildren.filter(Boolean) as Node[];

export type Env = ReadonlyMap<string, Value>;
/** Evaluates `node` with `env`; throws NotEvaluable for anything outside the safe subset. */
export function evaluate(node: Node, env: Env): Value {
  const python = node.tree.rootNode.type === "module";
  const test = (v: Value) => truthy(v, python);
  const t = node.type;
  switch (t) {
    case "parenthesized_expression":
    case "expression_statement":
      return evaluate(kids(node)[0] ?? no("empty"), env);
    case "number":
    case "integer":
    case "float": {
      const text = node.text.replaceAll("_", "");
      const value = Number(text);
      return Number.isFinite(value) && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)
        ? value
        : no(`number ${text}`);
    }
    case "string": {
      // Only plain strings; template strings with substitutions are refused.
      const raw = node.text;
      if (/^[rbfu]*["']{3}/i.test(raw) || /^[rbf]/i.test(raw)) return no("special string");
      const body = raw.replace(/^[ru]*/i, "");
      const quote = body[0];
      if (quote !== '"' && quote !== "'") return no("string");
      const inner = body.slice(1, -1);
      if (/\\(?!["'\\nt])/.test(inner)) return no("escape");
      return inner.replace(/\\(["'\\nt])/g, (_, escaped: string) =>
        escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped,
      );
    }
    case "template_string":
      return kids(node).some((c) => c.type === "template_substitution") || node.text.includes("\\")
        ? no("template")
        : node.text.slice(1, -1);
    case "true":
      return true;
    case "false":
      return false;
    case "null":
    case "none":
      return null;
    case "undefined":
      return env.has("undefined") ? env.get("undefined") : undefined;
    case "identifier": {
      if (env.has(node.text)) return env.get(node.text);
      if (node.text === "undefined") return undefined;
      if (node.text === "True") return true;
      if (node.text === "False") return false;
      if (node.text === "None") return null;
      return env.has(node.text) ? (env.get(node.text) as Value) : no(`unknown name ${node.text}`);
    }
    case "member_expression":
    case "attribute":
    case "subscript_expression":
    case "subscript": {
      if (node.text.includes("?.")) return no("optional chaining");
      const target = evaluate(field(node, "object") ?? field(node, "value") ?? kids(node)[0] ?? no("member"), env);
      let key: Value;
      if (t === "member_expression" || t === "attribute") {
        const prop = field(node, "property") ?? field(node, "attribute");
        if (!prop) return no("property");
        if (node.text.includes("?."))
          return target === null || target === undefined ? undefined : read(target, prop.text, python);
        key = prop.text;
      } else key = evaluate(field(node, "index") ?? field(node, "subscript") ?? kids(node)[1] ?? no("index"), env);
      return read(target, key, python);
    }
    case "unary_expression":
    case "not_operator": {
      const op = field(node, "operator")?.text ?? (t === "not_operator" ? "not" : node.text[0]);
      const arg = field(node, "argument") ?? kids(node)[0] ?? no("argument");
      if (op === "!" || op === "not") return !test(evaluate(arg, env));
      if (op === "-" && (arg.type === "number" || arg.type === "integer" || arg.type === "float"))
        return -(evaluate(arg, env) as number);
      return no(`unary ${op}`);
    }
    case "binary_expression":
    case "boolean_operator": {
      const op = field(node, "operator")?.text ?? "";
      const left = field(node, "left") ?? no("left"),
        right = field(node, "right") ?? no("right");
      if (op === "&&" || op === "and") {
        const l = evaluate(left, env);
        return test(l) ? evaluate(right, env) : l;
      }
      if (op === "||" || op === "or") {
        const l = evaluate(left, env);
        return test(l) ? l : evaluate(right, env);
      }
      if (op === "??") {
        const l = evaluate(left, env);
        return l === null || l === undefined ? evaluate(right, env) : l;
      }
      return compare(op, evaluate(left, env), evaluate(right, env));
    }
    case "comparison_operator": {
      // Python chains: a < b < c.
      const operands = kids(node);
      const ops = node.children
        .filter((c): c is Node => Boolean(c) && !c?.isNamed)
        .map((c) => c.text)
        .reduce<string[]>((acc, op) => {
          if (op === "not" && acc.at(-1) === "is") acc[acc.length - 1] = "is not";
          else acc.push(op);
          return acc;
        }, []);
      let result = true;
      for (let i = 0; i < ops.length; i++) {
        const op = PY_OPS[ops[i] ?? ""] ?? no(`operator ${ops[i]}`);
        const left = evaluate(operands[i] ?? no("operand"), env),
          right = evaluate(operands[i + 1] ?? no("operand"), env);
        if (typeof left !== typeof right && left !== null && right !== null) return no("mixed Python comparison");
        if ((ops[i] === "is" || ops[i] === "is not") && left !== null && typeof left !== "boolean")
          return no("Python identity");
        result = result && compare(op, left, right);
      }
      return result;
    }
    case "ternary_expression":
    case "conditional_expression": {
      if (t === "ternary_expression")
        return test(evaluate(field(node, "condition") ?? no("condition"), env))
          ? evaluate(field(node, "consequence") ?? no("then"), env)
          : evaluate(field(node, "alternative") ?? no("else"), env);
      // Python: a if cond else b
      const [a, cond, b] = kids(node);
      return test(evaluate(cond ?? no("condition"), env)) ? evaluate(a ?? no("a"), env) : evaluate(b ?? no("b"), env);
    }
    case "array":
    case "list":
    case "tuple":
      return kids(node).map((c) => evaluate(c, env));
    case "object":
    case "dictionary": {
      const out: { [key: string]: Value } = Object.create(null);
      for (const pair of kids(node)) {
        if (pair.type !== "pair") return no("object member");
        const k = field(pair, "key") ?? no("key");
        const key = k.type === "property_identifier" || k.type === "identifier" ? k.text : evaluate(k, env);
        if (typeof key !== "string" && typeof key !== "number") return no("key");
        if (["__proto__", "constructor", "prototype"].includes(String(key))) return no("unsafe key");
        out[String(key)] = evaluate(field(pair, "value") ?? no("value"), env);
      }
      return out;
    }
    case "call": {
      // Only Python's len() of a literal.
      const fn = field(node, "function");
      const args = kids(field(node, "arguments") ?? no("args"));
      if (fn?.text === "len" && args.length === 1 && !env.has("len"))
        return length(evaluate(args[0] ?? no("arg"), env), true);
      return no("call");
    }
    default:
      return no(t);
  }
}
function length(v: Value, python = false): number {
  if (typeof v === "string") return python ? [...v].length : v.length;
  if (Array.isArray(v)) return v.length;
  return no("length of a non-literal");
}
function read(target: Value, key: Value, python = false): Value {
  if (!python && key === "length" && (typeof target === "string" || Array.isArray(target))) return target.length;
  if (Array.isArray(target) && typeof key === "number") {
    const index = python && key < 0 ? target.length + key : key;
    if (python && (!Number.isInteger(index) || index < 0 || index >= target.length)) return no("index out of range");
    return target[index];
  }
  if (isObject(target) && (typeof key === "string" || typeof key === "number")) {
    const k = String(key);
    if (k === "__proto__" || k === "constructor" || k === "prototype") return no("unsafe key");
    if (!Object.hasOwn(target, k) && python) return no("missing key");
    return Object.hasOwn(target, k) ? target[k] : undefined;
  }
  return no(`property ${String(key)} of ${target === null ? "null" : typeof target}`);
}
/** Renders a literal the way the player sees it in choices: `{ dueDate: 10, done: true }`. */
export function show(v: Value): string {
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(show).join(", ")}]`;
  if (isObject(v)) {
    const entries = Object.entries(v);
    return entries.length
      ? `{ ${entries.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${show(x)}`).join(", ")} }`
      : "{}";
  }
  return String(v);
}
