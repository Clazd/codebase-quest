import { fileURLToPath } from "node:url";
import type { Language as SourceLanguage } from "@codebase-quest/shared";
import { Language, type Node, Parser } from "web-tree-sitter";

/**
 * A function's statements as a small tree: just enough structure for bodies,
 * the safe evaluator and question generators. Nothing here executes code.
 */
interface Base {
  /** First and last line of the cell's own text (the header for compound statements). */
  startLine: number;
  headerEnd: number;
  endLine: number;
  /** The cell's own source text (header only for compound statements). */
  text: string;
  node: Node;
}
export type Stmt =
  | (Base & { kind: "if"; cond: Node; consequent: Stmt[]; else: Stmt[] | null; elseIf: boolean })
  | (Base & { kind: "loop"; body: Stmt[] })
  | (Base & { kind: "switch"; value: Node; cases: (Base & { test: Node | null; body: Stmt[] })[] })
  | (Base & { kind: "try"; body: Stmt[]; catchClause: (Base & { body: Stmt[] }) | null; finally: Stmt[] | null })
  | (Base & { kind: "return" | "throw"; value: Node | null })
  | (Base & { kind: "decl"; names: string[]; value: Node | null; call: Node | null })
  | (Base & { kind: "expr"; call: Node | null; assigns: string[] })
  | (Base & { kind: "break" | "other" });

let ready: Promise<void> | undefined;
const grammars = new Map<string, Promise<Language>>();
/** Parses source text with the analyzer's bundled grammars (checked by hashes in Phase 02). */
export async function parse(text: string, language: SourceLanguage): Promise<Node> {
  ready ??= Parser.init();
  await ready;
  const name = language === "jsx" ? "javascript" : language;
  let grammar = grammars.get(name);
  if (!grammar) {
    grammar = Language.load(
      fileURLToPath(new URL(`../../analyzer/grammars/tree-sitter-${name}.wasm`, import.meta.url)),
    );
    grammars.set(name, grammar);
  }
  const parser = new Parser();
  parser.setLanguage(await grammar);
  const tree = parser.parse(text);
  parser.delete();
  if (!tree) throw new Error("Parser returned no syntax tree");
  return tree.rootNode;
}
const FUNCTION_TYPES = new Set([
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "arrow_function",
  "method_definition",
  "function_definition",
  "class_declaration",
  "class_definition",
  "abstract_class_declaration",
]);
/** The function/method/class node whose range starts at the symbol's start position. */
export function findDefinition(root: Node, startLine: number, startColumn: number, endLine: number): Node | null {
  let best: Node | null = null;
  const visit = (node: Node) => {
    if (node.startPosition.row + 1 > endLine || node.endPosition.row + 1 < startLine) return;
    if (
      FUNCTION_TYPES.has(node.type) &&
      node.startPosition.row + 1 >= startLine &&
      node.endPosition.row + 1 <= endLine &&
      (!best || node.startPosition.row + 1 < best.startPosition.row + 1 || node.text.length > best.text.length)
    ) {
      if (!best || node.startPosition.row + 1 !== startLine || node.startPosition.column >= startColumn - 1)
        best = node;
    }
    for (const child of node.namedChildren) if (child) visit(child);
  };
  visit(root);
  return best;
}
const line = (n: Node) => n.startPosition.row + 1;
const endOf = (n: Node) => n.endPosition.row + 1;
const named = (n: Node | null): Node[] => (n ? (n.namedChildren.filter(Boolean) as Node[]) : []);
/** Text of a compound statement's header: from its start up to (not including) its block. */
function header(node: Node, block: Node | null): { text: string; end: number } {
  if (!block || block.startIndex <= node.startIndex) return { text: firstLine(node.text), end: line(node) };
  const text = node.text.slice(0, block.startIndex - node.startIndex).trimEnd();
  return {
    text: text.replace(/\s+/g, " ").replace(/[{:]$/, "").trim(),
    end: Math.max(line(node), line(block) - (block.text.startsWith("{") ? 0 : 1)),
  };
}
const firstLine = (text: string) => (text.split("\n")[0] ?? "").trim();
function unwrapCall(n: Node | null): Node | null {
  let node = n;
  while (
    node &&
    (node.type === "await_expression" || node.type === "await" || node.type === "parenthesized_expression")
  )
    node = named(node)[0] ?? null;
  return node && node.type === "call_expression" ? node : node && node.type === "call" ? node : null;
}
function blockStatements(block: Node | null): Stmt[] {
  if (!block) return [];
  if (["statement_block", "block", "switch_body"].includes(block.type)) return named(block).flatMap(statement);
  return statement(block);
}
function base(node: Node, headerNode: Node | null = null) {
  const h = header(node, headerNode);
  return { startLine: line(node), headerEnd: h.end, endLine: endOf(node), text: h.text, node };
}
/** One statement node → zero or more Stmts (comments and empty statements are dropped). */
export function statement(node: Node): Stmt[] {
  const t = node.type;
  if (t === "comment" || t === "empty_statement" || t === "pass_statement" || t === "decorator") return [];
  if (t === "if_statement" || t === "elif_clause") {
    const cond = node.childForFieldName("condition");
    const then = node.childForFieldName("consequence");
    const alternative = node.childForFieldName("alternative");
    let elseStmts: Stmt[] | null = null;
    // Python puts elif/else clauses as repeated `alternative` children; JS has one else_clause.
    const alternatives =
      t === "if_statement" ? (node.childrenForFieldName("alternative").filter(Boolean) as Node[]) : [];
    const alts = alternatives.length ? alternatives : alternative ? [alternative] : [];
    if (alts.length) {
      const [first, ...rest] = alts;
      if (first?.type === "elif_clause") {
        const chained = statement(first) as Stmt[];
        const top = chained[0];
        if (top?.kind === "if" && rest.length) top.else = buildElse(rest);
        elseStmts = chained;
      } else if (first) elseStmts = buildElse([first, ...rest]);
    }
    if (!cond) return [{ ...base(node), kind: "other" }];
    return [
      {
        ...base(node, then),
        kind: "if",
        cond: cond.type === "parenthesized_expression" ? (named(cond)[0] ?? cond) : cond,
        consequent: blockStatements(then),
        else: elseStmts,
        elseIf: t === "elif_clause" || node.parent?.type === "else_clause",
      },
    ];
  }
  if (["for_statement", "for_in_statement", "while_statement", "do_statement", "for_of_statement"].includes(t)) {
    const body = node.childForFieldName("body");
    return [{ ...base(node, body), kind: "loop", body: blockStatements(body) }];
  }
  if (t === "switch_statement") {
    const body = node.childForFieldName("body");
    const value = node.childForFieldName("value");
    const cases = named(body).flatMap((c) => {
      if (c.type !== "switch_case" && c.type !== "switch_default") return [];
      const test = c.childForFieldName("value");
      const stmts = named(c)
        .filter((x) => x.id !== test?.id)
        .flatMap(statement);
      return [{ ...base(c), text: firstLine(c.text).replace(/:.*$/, ":"), headerEnd: line(c), test, body: stmts }];
    });
    if (!value) return [{ ...base(node), kind: "other" }];
    return [{ ...base(node, body), kind: "switch", value: named(value)[0] ?? value, cases }];
  }
  if (t === "try_statement") {
    const body = node.childForFieldName("body");
    const handler = node.childForFieldName("handler") ?? named(node).find((c) => c.type === "except_clause") ?? null;
    const finalizer =
      node.childForFieldName("finalizer") ?? named(node).find((c) => c.type === "finally_clause") ?? null;
    const handlerBody = handler
      ? (handler.childForFieldName("body") ?? named(handler).find((c) => c.type === "block") ?? null)
      : null;
    const finalBody = finalizer
      ? (finalizer.childForFieldName("body") ?? named(finalizer).find((c) => c.type === "block") ?? null)
      : null;
    return [
      {
        ...base(node, body),
        text: "try",
        kind: "try",
        body: blockStatements(body),
        catchClause: handler ? { ...base(handler, handlerBody), body: blockStatements(handlerBody) } : null,
        finally: finalizer ? blockStatements(finalBody) : null,
      },
    ];
  }
  if (t === "return_statement")
    return [{ ...base(node), text: oneLine(node.text), kind: "return", value: named(node)[0] ?? null }];
  if (t === "throw_statement" || t === "raise_statement")
    return [{ ...base(node), text: oneLine(node.text), kind: "throw", value: named(node)[0] ?? null }];
  if (t === "break_statement" || t === "continue_statement") return [{ ...base(node), kind: "break" }];
  if (t === "lexical_declaration" || t === "variable_declaration") {
    const declarators = named(node).filter((c) => c.type === "variable_declarator");
    const names = declarators.flatMap((d) => {
      const n = d.childForFieldName("name");
      return n?.type === "identifier" ? [n.text] : [];
    });
    const value = declarators.length === 1 ? (declarators[0]?.childForFieldName("value") ?? null) : null;
    return [{ ...base(node), text: oneLine(node.text), kind: "decl", names, value, call: unwrapCall(value) }];
  }
  if (t === "expression_statement") {
    const expr = named(node)[0] ?? null;
    // Python assignments are expression statements.
    if (expr && (expr.type === "assignment" || expr.type === "augmented_assignment")) {
      const left = expr.childForFieldName("left");
      const right = expr.childForFieldName("right");
      if (expr.type === "assignment" && left?.type === "identifier")
        return [
          {
            ...base(node),
            text: oneLine(node.text),
            kind: "decl",
            names: [left.text],
            value: right,
            call: unwrapCall(right),
          },
        ];
      return [
        {
          ...base(node),
          text: oneLine(node.text),
          kind: "expr",
          call: unwrapCall(right),
          assigns: left?.type === "identifier" ? [left.text] : [],
        },
      ];
    }
    const assigns: string[] = [];
    if (expr && /assignment/.test(expr.type)) {
      const left = expr.childForFieldName("left");
      if (left?.type === "identifier") assigns.push(left.text);
    }
    if (expr?.type === "update_expression") {
      const arg = expr.childForFieldName("argument");
      if (arg?.type === "identifier") assigns.push(arg.text);
    }
    return [{ ...base(node), text: oneLine(node.text), kind: "expr", call: unwrapCall(expr), assigns }];
  }
  if (t === "statement_block" || t === "block") return blockStatements(node);
  return [{ ...base(node), text: oneLine(node.text), kind: "other" }];
}
function buildElse(clauses: Node[]): Stmt[] {
  const [first, ...rest] = clauses;
  if (!first) return [];
  if (first.type === "elif_clause") {
    const chained = statement(first);
    const top = chained[0];
    if (top?.kind === "if" && rest.length) top.else = buildElse(rest);
    return chained;
  }
  // JS `else_clause` holds one statement (a block or an `if`); Python `else_clause` has a `body` block.
  const body = first.childForFieldName("body") ?? named(first)[0] ?? null;
  return blockStatements(body);
}
const oneLine = (text: string) => {
  const lines = text.split("\n").map((l) => l.trim());
  return lines.length > 1 ? `${lines[0]} …` : (lines[0] ?? "");
};
/** The statements of a function's body; an expression-bodied arrow becomes one implicit return. */
export function functionStatements(definition: Node): Stmt[] {
  const body = definition.childForFieldName("body");
  if (!body) return [];
  if (definition.type.startsWith("class")) {
    // Classes: each member is a plain cell (methods are their own characters).
    return named(body)
      .filter((m) => m.type !== "comment")
      .map((m) => ({ ...base(m), text: oneLine(m.text), kind: "other" as const }));
  }
  if (body.type !== "statement_block" && body.type !== "block")
    return [{ ...base(body), text: `return ${oneLine(body.text)}`, kind: "return", value: body }];
  return blockStatements(body);
}
/** Parameter names in declaration order (destructured parameters are skipped). */
export function parameterNames(definition: Node): string[] {
  const params = definition.childForFieldName("parameters") ?? definition.childForFieldName("parameter");
  if (!params) return [];
  if (params.type === "identifier") return [params.text];
  return named(params)
    .flatMap((p) => {
      if (p.type === "identifier") return [p.text];
      const pattern = p.childForFieldName("pattern") ?? p.childForFieldName("name") ?? named(p)[0];
      return pattern?.type === "identifier" ? [pattern.text] : [];
    })
    .filter((n) => n !== "self" && n !== "cls");
}
/** Every identifier node under `node`, in source order. */
export function identifiers(node: Node): Node[] {
  const out: Node[] = [];
  const visit = (n: Node) => {
    if (["identifier", "property_identifier", "shorthand_property_identifier"].includes(n.type)) out.push(n);
    for (const c of n.namedChildren) if (c) visit(c);
  };
  visit(node);
  return out;
}
/** Every call node under `node`, in source order, with the called name as written. */
export function calls(node: Node): { node: Node; name: string; line: number }[] {
  const out: { node: Node; name: string; line: number }[] = [];
  const visit = (n: Node) => {
    if (n.type === "call_expression" || n.type === "call") {
      const fn = n.childForFieldName("function");
      if (fn) out.push({ node: n, name: fn.text.replace(/\s+/g, ""), line: line(n) });
    }
    for (const c of n.namedChildren) if (c) visit(c);
  };
  visit(node);
  return out;
}
