import { fileURLToPath } from "node:url";
import type { Diagnostic, EntryPoint, Language, LiteralValue, SourceRange, SymbolNode } from "@codebase-quest/shared";
import { Language as Grammar, type Node, Parser } from "web-tree-sitter";
import type { SourceFile } from "./discover.ts";
import { literal, NOT_LITERAL, stringValue } from "./literals.ts";
import { diagnostic, hash, id, mask } from "./util.ts";

export interface ImportBinding {
  local: string;
  imported: string;
  namespace: boolean;
}
export interface RawImport {
  source: string;
  bindings: ImportBinding[];
  line: number;
  python: boolean;
  reexport: boolean;
}
export interface RawCall {
  from: string;
  callee: string;
  receiver: string | null;
  property: string | null;
  dynamic: boolean;
  line: number;
  shadowed: boolean;
}
export interface RawFact {
  callee: string;
  args: LiteralValue[];
  expected: LiteralValue;
  matcher: "equal" | "deep-equal";
  line: number;
}
export interface Detail {
  normalized: string;
  statements: number;
  magicLines: number[];
  emptyCatchLines: number[];
  missingTypeLines: number[];
  methodCount: number;
  fields: string[];
  locals: string[];
  writesOuter: boolean;
}
export interface Extracted {
  symbols: SymbolNode[];
  imports: RawImport[];
  calls: RawCall[];
  facts: RawFact[];
  entries: EntryPoint[];
  diagnostics: Diagnostic[];
  details: Record<string, Detail>;
  strings: string[];
  todoLines: number[];
  heritage: { from: string; name: string; kind: "extends" | "implements"; line: number }[];
}
export interface LanguageExtractor {
  extract(file: SourceFile): Promise<Extracted>;
}
const languages = new Map<string, Grammar>();
let initialization: Promise<void> | undefined;
export const range = (node: Node): SourceRange => ({
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
  startColumn: node.startPosition.column,
  endColumn: node.endPosition.column,
});
const field = (node: Node, name: string) => node.childForFieldName(name);
const walk = (node: Node, fn: (node: Node) => void) => {
  fn(node);
  for (const child of node.namedChildren) walk(child, fn);
};
const callTypes = new Set(["call_expression", "call", "new_expression"]);
const functionTypes = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "function_definition",
  "method_definition",
]);
const classTypes = new Set(["class_declaration", "class_definition", "class"]);
const branches = new Set([
  "if_statement",
  "elif_clause",
  "switch_case",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "except_clause",
  "conditional_expression",
  "ternary_expression",
  "if_clause",
]);
const nesting = new Set([
  "if_statement",
  "elif_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "try_statement",
  "with_statement",
  "switch_statement",
]);
const calleeNode = (node: Node) => field(node, "function") ?? field(node, "constructor");
const argsNode = (node: Node) => field(node, "arguments");
function callName(node: Node): { name: string; receiver: string | null; property: string | null; dynamic: boolean } {
  const callee = calleeNode(node);
  if (!callee) return { name: "<dynamic>", receiver: null, property: null, dynamic: true };
  const property = field(callee, "property") ?? field(callee, "attribute");
  const object = field(callee, "object");
  const dynamic =
    !["identifier", "member_expression", "attribute", "super"].includes(callee.type) ||
    ["subscript", "subscript_expression"].includes(callee.type) ||
    callee.text === "getattr";
  return { name: mask(callee.text), receiver: object?.text ?? null, property: property?.text ?? null, dynamic };
}
function parameters(node: Node): SymbolNode["parameters"] {
  const params = field(node, "parameters") ?? field(node, "parameter");
  if (!params) return [];
  const children = params.type === "identifier" ? [params] : params.namedChildren.filter((c) => c.type !== "comment");
  return children.map((p) => ({
    name: mask(
      (
        field(p, "pattern") ??
        field(p, "name") ??
        p.namedChildren.find((c) => c.type === "identifier") ??
        p
      ).text.replace(/^\*+/, ""),
    ),
    type: (field(p, "type")?.text ?? null)?.replace(/^:\s*/, "") ?? null,
  }));
}
function normalize(node: Node): string {
  if (node.type === "comment") return "";
  // Literal values/operators remain. Identifier spelling is deliberately ignored,
  // including property identifiers, allowing the fixture's near-identical twins.
  if (/^(?:identifier|property_identifier|type_identifier|shorthand_property_identifier)$/.test(node.type))
    return "identifier";
  return node.children.length ? `${node.type}(${node.children.map(normalize).join(" ")})` : `${node.type}:${node.text}`;
}
function docOf(node: Node, python: boolean): string | null {
  if (python) {
    const first = field(node, "body")?.namedChildren[0];
    if (first?.type === "expression_statement" && first.namedChildren[0]?.type === "string")
      return mask(first.text.replace(/^["']{1,3}|["']{1,3}$/g, ""));
  }
  let previous = node.previousNamedSibling;
  if (node.parent?.type === "export_statement" || node.parent?.type === "decorated_definition")
    previous = node.parent.previousNamedSibling;
  return previous?.type === "comment" ? mask(previous.text) : null;
}
function literalArgs(node: Node): LiteralValue[] | null {
  const values = (argsNode(node)?.namedChildren ?? []).map(literal);
  return values.includes(NOT_LITERAL) ? null : (values as LiteralValue[]);
}

export const treeSitterExtractor: LanguageExtractor = {
  async extract(file) {
    initialization ??= Parser.init();
    await initialization;
    const language = file.language as Language;
    const grammarName = language === "jsx" ? "javascript" : language;
    let grammar = languages.get(grammarName);
    if (!grammar) {
      grammar = await Grammar.load(
        fileURLToPath(new URL(`../grammars/tree-sitter-${grammarName}.wasm`, import.meta.url)),
      );
      languages.set(grammarName, grammar);
    }
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(file.text);
    if (!tree) {
      parser.delete();
      throw new Error("Parser returned no syntax tree");
    }
    const output: Extracted = {
      symbols: [],
      imports: [],
      calls: [],
      facts: [],
      entries: [],
      diagnostics: [],
      details: {},
      strings: [],
      todoLines: [],
      heritage: [],
    };
    const python = language === "python";
    const fileId = id(file.path, "file", file.path);
    const nodeSymbols = new Map<number, SymbolNode>();
    const ordinals = new Map<string, number>();
    const nodes: Node[] = [];
    walk(tree.rootNode, (n) => nodes.push(n));
    try {
      for (const node of nodes) {
        if (node.isError || node.isMissing)
          output.diagnostics.push(
            diagnostic(
              file.path,
              "parse-error",
              node.startPosition.row + 1,
              "Recovered syntax error or missing syntax node.",
            ),
          );
        if (node.type === "comment" && /\b(?:TODO|FIXME|HACK)\b/.test(node.text))
          output.todoLines.push(node.startPosition.row + 1);
        if (node.type === "string") {
          const value = stringValue(node.text);
          if (value !== NOT_LITERAL && mask(value) === value) output.strings.push(value);
        }
        if (node.type === "import_statement" && !python) {
          const source = stringValue(field(node, "source")?.text ?? "");
          if (source === NOT_LITERAL) continue;
          const bindings: ImportBinding[] = [];
          const clause = node.namedChildren.find((c) => c.type === "import_clause");
          if (clause)
            for (const child of clause.namedChildren) {
              if (child.type === "identifier")
                bindings.push({ local: child.text, imported: "default", namespace: false });
              if (child.type === "namespace_import") {
                const local = child.namedChildren.at(-1)?.text;
                if (local) bindings.push({ local, imported: "*", namespace: true });
              }
              if (child.type === "named_imports")
                for (const spec of child.namedChildren)
                  bindings.push({
                    local: (field(spec, "alias") ?? field(spec, "name"))?.text ?? spec.text,
                    imported: field(spec, "name")?.text ?? spec.text,
                    namespace: false,
                  });
            }
          output.imports.push({ source, bindings, line: node.startPosition.row + 1, python: false, reexport: false });
        }
        if (python && ["import_statement", "import_from_statement"].includes(node.type)) {
          const module = field(node, "module_name");
          for (const name of node.namedChildren.filter((c) => c.id !== module?.id)) {
            const imported = (field(name, "name") ?? name).text;
            const local = field(name, "alias")?.text ?? imported.split(".")[0] ?? imported;
            if (name.type === "wildcard_import")
              output.diagnostics.push(
                diagnostic(
                  file.path,
                  "unresolved-import",
                  node.startPosition.row + 1,
                  "Wildcard Python import cannot resolve exact bindings.",
                ),
              );
            output.imports.push({
              source: module?.text ?? imported,
              bindings: [{ local, imported: module ? imported : "*", namespace: !module }],
              line: node.startPosition.row + 1,
              python: true,
              reexport: false,
            });
          }
        }
        if (node.type === "export_statement" && field(node, "source")) {
          const source = stringValue(field(node, "source")?.text ?? "");
          if (source !== NOT_LITERAL) {
            const clause = node.namedChildren.find((c) => c.type === "export_clause");
            output.imports.push({
              source,
              bindings:
                clause?.namedChildren.map((spec) => ({
                  local: (field(spec, "alias") ?? field(spec, "name"))?.text ?? spec.text,
                  imported: field(spec, "name")?.text ?? spec.text,
                  namespace: false,
                })) ?? [],
              line: node.startPosition.row + 1,
              python: false,
              reexport: true,
            });
          }
        }
        let kind: SymbolNode["kind"] | null = classTypes.has(node.type)
          ? "class"
          : node.type === "interface_declaration"
            ? "interface"
            : node.type === "type_alias_declaration"
              ? "type"
              : functionTypes.has(node.type)
                ? "function"
                : null;
        if (!kind) continue;
        let name = field(node, "name")?.text;
        if (node.parent?.type === "variable_declarator") name = field(node.parent, "name")?.text;
        if (!name && python && node.parent?.type === "assignment") name = field(node.parent, "left")?.text;
        let testCallback = false;
        if (
          !name &&
          node.parent &&
          ["arguments", "argument_list"].includes(node.parent.type) &&
          node.parent.parent &&
          callTypes.has(node.parent.parent.type)
        ) {
          const call = callName(node.parent.parent);
          if (/^(?:it|test|describe)(?:\.|$)/.test(call.name)) {
            name = `${call.name}@${node.startPosition.row + 1}`;
            testCallback = true;
          }
        }
        if (!name) {
          if (node.parent?.type === "export_statement") name = "default";
          else continue;
        }
        let parent = node.parent;
        let owner: SymbolNode | undefined;
        while (parent) {
          owner = nodeSymbols.get(parent.id);
          if (owner) break;
          parent = parent.parent;
        }
        if (kind === "function" && (node.type === "method_definition" || (python && owner?.kind === "class")))
          kind = "method";
        const qualifiedName = owner ? `${owner.qualifiedName}.${name}` : name;
        const ordinal = ordinals.get(`${kind}#${qualifiedName}`) ?? 0;
        ordinals.set(`${kind}#${qualifiedName}`, ordinal + 1);
        const params = kind === "function" || kind === "method" ? parameters(node) : [];
        const exported = python
          ? !name.startsWith("_") && !owner
          : node.parent?.type === "export_statement" || node.parent?.parent?.parent?.type === "export_statement";
        const doc = docOf(node, python);
        const decorators =
          node.parent?.type === "decorated_definition"
            ? node.parent.namedChildren.filter((c) => c.type === "decorator").map((c) => mask(c.text))
            : node.namedChildren.filter((c) => c.type === "decorator").map((c) => mask(c.text));
        const traits: string[] = [];
        if (exported) traits.push("exported");
        if (file.role === "test" || testCallback) traits.push("test");
        const isAsync = /^(?:export\s+)?async\b/.test(node.text) || node.children.some((c) => c.type === "async");
        if (isAsync) traits.push("async");
        if (name === "constructor" || name === "__init__") traits.push("constructor");
        if (/^(?:on[A-Z_]|handle[A-Z_]|on_|handle_)/.test(name)) traits.push("event-handler");
        if (/@deprecated\b/.test(doc ?? "") || decorators.some((d) => /deprecated/.test(d))) traits.push("deprecated");
        const symbol: SymbolNode = {
          id: id(file.path, kind, qualifiedName, ordinal),
          fileId,
          parentId: owner?.id ?? null,
          kind,
          name: mask(name),
          qualifiedName: mask(qualifiedName),
          range: range(node),
          exported,
          async: isAsync,
          generator: node.type.includes("generator") || node.children.some((c) => c.type === "*"),
          parameters: params,
          returnType: (field(node, "return_type")?.text ?? null)?.replace(/^:\s*/, "") ?? null,
          doc,
          decorators,
          traits,
          metrics: {
            loc: node.endPosition.row - node.startPosition.row + 1,
            cyclomatic: kind === "function" || kind === "method" ? 1 : 0,
            maxNesting: 0,
            params: params.length,
            fanIn: 0,
            fanOut: 0,
            dynamicCalls: 0,
          },
        };
        output.symbols.push(symbol);
        nodeSymbols.set(node.id, symbol);
        if (kind === "class" || kind === "interface")
          for (const child of node.namedChildren.filter((c) =>
            ["class_heritage", "extends_type_clause", "argument_list"].includes(c.type),
          )) {
            walk(child, (part) => {
              if (["extends_clause", "implements_clause", "extends_type_clause", "argument_list"].includes(part.type))
                for (const base of part.namedChildren)
                  if (["identifier", "type_identifier", "generic_type"].includes(base.type))
                    output.heritage.push({
                      from: symbol.id,
                      name: base.type === "generic_type" ? (field(base, "name")?.text ?? base.text) : base.text,
                      kind: part.type === "implements_clause" ? "implements" : "extends",
                      line: base.startPosition.row + 1,
                    });
            });
          }
        const body = field(node, "body");
        output.details[symbol.id] = {
          normalized: body ? hash(normalize(body)) : "",
          statements: body?.namedChildren.filter((c) => c.type !== "comment").length ?? 0,
          magicLines: [],
          emptyCatchLines: [],
          missingTypeLines: [],
          methodCount:
            kind === "class"
              ? (body?.namedChildren.filter((c) => c.type === "method_definition" || c.type === "function_definition")
                  .length ?? 0)
              : 0,
          fields: [],
          locals: [],
          writesOuter: false,
        };
      }
      // Ownership is lexical: nested functions don't inflate the parent's metrics.
      function visit(node: Node, owner: SymbolNode | undefined, depth: number) {
        const symbol = nodeSymbols.get(node.id);
        if (symbol && symbol !== owner) {
          owner = symbol;
          depth = 0;
        }
        const detail = owner ? output.details[owner.id] : undefined;
        if (owner && detail) {
          if (node.type === "yield" || node.type === "yield_expression") owner.generator = true;
          if (branches.has(node.type) && ["function", "method"].includes(owner.kind)) owner.metrics.cyclomatic++;
          if (["binary_expression", "boolean_operator"].includes(node.type))
            for (const child of node.children)
              if (["&&", "||", "and", "or"].includes(child.type)) owner.metrics.cyclomatic++;
          if (nesting.has(node.type)) {
            depth++;
            owner.metrics.maxNesting = Math.max(owner.metrics.maxNesting, depth);
          }
          if (node.type === "variable_declarator" || (python && node.type === "assignment")) {
            const name = field(node, "name") ?? field(node, "left");
            if (name?.type === "identifier") detail.locals.push(name.text);
          }
          if (
            [
              "assignment_expression",
              "augmented_assignment_expression",
              "update_expression",
              "augmented_assignment",
            ].includes(node.type)
          ) {
            const left = field(node, "left") ?? field(node, "argument") ?? node.namedChildren[0];
            if (
              left?.type === "identifier" &&
              !detail.locals.includes(left.text) &&
              !owner.parameters.some((p) => p.name === left.text)
            )
              detail.writesOuter = true;
          }
          if (["number", "integer", "float"].includes(node.type) && file.role !== "test") {
            const value = literal(node);
            let parent = node.parent;
            let namedConst = false;
            while (parent) {
              if (parent.type === "lexical_declaration" && parent.children.some((c) => c.type === "const")) {
                namedConst = true;
                break;
              }
              if (
                parent === node.parent?.parent?.parent ||
                parent.type === "statement_block" ||
                parent.type === "block"
              )
                break;
              parent = parent.parent;
            }
            if (typeof value === "number" && ![0, 1].includes(value) && !namedConst)
              detail.magicLines.push(node.startPosition.row + 1);
          }
          if (["catch_clause", "except_clause"].includes(node.type)) {
            const body =
              field(node, "body") ?? node.namedChildren.find((c) => ["block", "statement_block"].includes(c.type));
            if (body?.namedChildren.every((c) => c.type === "comment" || c.type === "pass_statement"))
              detail.emptyCatchLines.push(node.startPosition.row + 1);
          }
        }
        if (callTypes.has(node.type)) {
          const call = callName(node);
          const from = owner?.id ?? fileId;
          const shadowed =
            owner?.parameters.some((p) => p.name === call.name) || detail?.locals.includes(call.name) || false;
          output.calls.push({
            from,
            callee: call.name,
            receiver: call.receiver,
            property: call.property,
            dynamic: call.dynamic,
            line: node.startPosition.row + 1,
            shadowed,
          });
          if (owner && (call.dynamic || shadowed)) owner.metrics.dynamicCalls++;
          // Matchers and target invocations must both be syntactically literal.
          if (file.role === "test") {
            let target: Node | null = null;
            let expected: Node | null = null;
            let matcher: "equal" | "deep-equal" = "equal";
            const callee = calleeNode(node);
            if (
              call.property &&
              ["toBe", "toEqual", "equal", "strictEqual", "deepEqual", "deepStrictEqual", "assertEqual"].includes(
                call.property,
              )
            ) {
              if (["toBe", "toEqual"].includes(call.property)) {
                const expectCall = field(callee as Node, "object");
                if (expectCall && callTypes.has(expectCall.type) && calleeNode(expectCall)?.text === "expect")
                  target = argsNode(expectCall)?.namedChildren[0] ?? null;
                expected = argsNode(node)?.namedChildren[0] ?? null;
              } else if (["assert", "self"].includes(call.receiver ?? "")) {
                target = argsNode(node)?.namedChildren[0] ?? null;
                expected = argsNode(node)?.namedChildren[1] ?? null;
              }
              if (["toEqual", "deepEqual", "deepStrictEqual"].includes(call.property)) matcher = "deep-equal";
            }
            if (target && callTypes.has(target.type)) {
              const args = literalArgs(target);
              const value = literal(expected);
              if (
                args &&
                value !== NOT_LITERAL &&
                mask(JSON.stringify([args, value])) === JSON.stringify([args, value])
              )
                output.facts.push({
                  callee: callName(target).name,
                  args,
                  expected: value,
                  matcher,
                  line: node.startPosition.row + 1,
                });
              else
                output.diagnostics.push(
                  diagnostic(
                    file.path,
                    "assertion-skipped",
                    node.startPosition.row + 1,
                    "Assertion uses non-literal or sensitive values.",
                  ),
                );
            }
          }
          const first = literal(argsNode(node)?.namedChildren[0] ?? null);
          let entryKind: EntryPoint["kind"] | null = null;
          let label = "";
          let handler: string | null = null;
          if (typeof first === "string" && call.property && /^(?:app|router|server)$/.test(call.receiver ?? "")) {
            if (["get", "post", "put", "patch", "delete", "all", "use"].includes(call.property)) {
              entryKind = "http";
              label = `${call.property.toUpperCase()} ${first}`;
              handler = argsNode(node)?.namedChildren.at(-1)?.text ?? null;
            }
          }
          if (typeof first === "string" && call.property === "on") {
            entryKind = "event";
            label = first;
            handler = argsNode(node)?.namedChildren[1]?.text ?? null;
          }
          if (typeof first === "string" && (call.property === "command" || call.property === "add_parser")) {
            entryKind = "cli";
            label = first;
          }
          if (entryKind) {
            const target = output.symbols.find((s) => s.name === handler);
            output.entries.push({
              id: id(file.path, `entry:${entryKind}`, `${node.startIndex}`),
              fileId,
              symbolId: target?.id ?? null,
              kind: entryKind,
              label: mask(label),
              range: range(node),
            });
          }
        }
        if (python && node.type === "assert_statement") {
          const comparison = node.namedChildren[0];
          if (comparison?.type === "comparison_operator" && comparison.children.some((c) => c.type === "==")) {
            const target = comparison.namedChildren[0];
            const expected = literal(comparison.namedChildren[1] ?? null);
            const args = target && callTypes.has(target.type) ? literalArgs(target) : null;
            if (
              target &&
              args &&
              expected !== NOT_LITERAL &&
              mask(JSON.stringify([args, expected])) === JSON.stringify([args, expected])
            )
              output.facts.push({
                callee: callName(target).name,
                args,
                expected,
                matcher:
                  Array.isArray(expected) || (typeof expected === "object" && expected !== null)
                    ? "deep-equal"
                    : "equal",
                line: node.startPosition.row + 1,
              });
            else
              output.diagnostics.push(
                diagnostic(
                  file.path,
                  "assertion-skipped",
                  node.startPosition.row + 1,
                  "Assertion uses non-literal or sensitive values.",
                ),
              );
          }
        }
        if (
          python &&
          node.type === "if_statement" &&
          /__name__\s*==\s*["']__main__["']/.test(field(node, "condition")?.text ?? "")
        )
          output.entries.push({
            id: id(file.path, "entry:main", `${node.startIndex}`),
            fileId,
            symbolId: null,
            kind: "main",
            label: "__main__",
            range: range(node),
          });
        for (const child of node.namedChildren) visit(child, owner, depth);
      }
      visit(tree.rootNode, undefined, 0);
      if (!python)
        for (const node of nodes.filter((n) => n.type === "export_specifier")) {
          const name = field(node, "name")?.text;
          const local = output.symbols.find((s) => s.name === name && s.parentId === null);
          if (local) {
            local.exported = true;
            local.traits.push("exported");
          }
        }
      for (const symbol of output.symbols) {
        const detail = output.details[symbol.id] as Detail;
        if (["function", "method"].includes(symbol.kind)) {
          for (const param of symbol.parameters)
            if (!["self", "cls"].includes(param.name) && (!param.type || /\bany\b/.test(param.type)))
              detail.missingTypeLines.push(symbol.range.startLine);
          if (
            python &&
            symbol.decorators.some((d) => /@(?:app|router)\.(?:route|get|post|put|patch|delete)\(/.test(d))
          ) {
            for (const deco of symbol.decorators) {
              const match = /@(?:app|router)\.(route|get|post|put|patch|delete)\(["']([^"']*)/.exec(deco);
              if (match)
                output.entries.push({
                  id: id(file.path, "entry:http", `${symbol.id}:${deco}`),
                  fileId,
                  symbolId: symbol.id,
                  kind: "http",
                  label: `${match[1] === "route" ? "GET" : match[1]?.toUpperCase()} ${mask(match[2] ?? "")}`,
                  range: symbol.range,
                });
            }
          }
          if (python && symbol.decorators.some((d) => /@(?:click|typer|app)\.command/.test(d)))
            output.entries.push({
              id: id(file.path, "entry:cli", symbol.id),
              fileId,
              symbolId: symbol.id,
              kind: "cli",
              label: symbol.name,
              range: symbol.range,
            });
        }
      }
      return output;
    } finally {
      tree.delete();
      parser.delete();
    }
  },
};
