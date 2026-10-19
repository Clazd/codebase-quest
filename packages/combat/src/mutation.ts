import type { Language } from "@codebase-quest/shared";
import type { Node } from "web-tree-sitter";
import { findDefinition, parse } from "./ast.ts";
import type { BuiltBody } from "./body.ts";

/** One injected bug: the line it changes, before and after. */
export interface Mutation {
  operator: "flip-comparison" | "swap-logic" | "remove-not" | "plus-minus" | "swap-args" | "return-null";
  cellId: string;
  line: number;
  original: string;
  mutated: string;
  description: string;
}
const FLIP: Record<string, string> = {
  "<": ">=",
  ">=": "<",
  ">": "<=",
  "<=": ">",
  "===": "!==",
  "!==": "===",
  "==": "!=",
  "!=": "==",
};
const kids = (n: Node) => n.namedChildren.filter(Boolean) as Node[];
function walk(n: Node, visit: (n: Node) => void) {
  visit(n);
  for (const c of kids(n)) walk(c, visit);
}
interface Edit {
  operator: Mutation["operator"];
  start: number;
  end: number;
  text: string;
  description: string;
}
/** Candidate edits inside one cell's own statement node (single line only, so line numbers stay stable). */
function edits(stmtNode: Node, python: boolean): Edit[] {
  const out: Edit[] = [];
  walk(stmtNode, (n) => {
    if (n.startPosition.row !== n.endPosition.row) return;
    const op = n.childForFieldName("operator");
    if ((n.type === "binary_expression" || n.type === "comparison_operator") && op && FLIP[op.text])
      out.push({
        operator: "flip-comparison",
        start: op.startIndex,
        end: op.endIndex,
        text: FLIP[op.text] as string,
        description: `\`${op.text}\` became \`${FLIP[op.text]}\``,
      });
    if (
      (n.type === "binary_expression" || n.type === "boolean_operator") &&
      op &&
      ["&&", "||", "and", "or"].includes(op.text)
    ) {
      const swapped = { "&&": "||", "||": "&&", and: "or", or: "and" }[op.text] as string;
      out.push({
        operator: "swap-logic",
        start: op.startIndex,
        end: op.endIndex,
        text: swapped,
        description: `\`${op.text}\` became \`${swapped}\``,
      });
    }
    if ((n.type === "unary_expression" && op?.text === "!") || n.type === "not_operator") {
      const arg = n.childForFieldName("argument") ?? kids(n)[0];
      if (arg)
        out.push({
          operator: "remove-not",
          start: n.startIndex,
          end: n.endIndex,
          text: arg.text,
          description: `the \`${python ? "not" : "!"}\` was removed`,
        });
    }
    if (n.type === "binary_expression" && op && (op.text === "+" || op.text === "-")) {
      const right = n.childForFieldName("right");
      if (right && (right.type === "number" || right.type === "integer") && right.text === "1")
        out.push({
          operator: "plus-minus",
          start: op.startIndex,
          end: op.endIndex,
          text: op.text === "+" ? "-" : "+",
          description: `\`${op.text} 1\` became \`${op.text === "+" ? "-" : "+"} 1\``,
        });
    }
    if (n.type === "arguments" || n.type === "argument_list") {
      const args = kids(n);
      const [a, b] = args;
      if (args.length >= 2 && a && b && a.text !== b.text && !a.text.includes("\n") && !b.text.includes("\n"))
        out.push({
          operator: "swap-args",
          start: a.startIndex,
          end: b.endIndex,
          text: `${b.text}${n.text.slice(a.endIndex - n.startIndex, b.startIndex - n.startIndex)}${a.text}`,
          description: `the arguments \`${a.text}\` and \`${b.text}\` were swapped`,
        });
    }
  });
  if (stmtNode.type === "return_statement") {
    const value = kids(stmtNode)[0];
    const nullText = python ? "None" : "null";
    if (value && value.text !== nullText && value.startPosition.row === value.endPosition.row)
      out.push({
        operator: "return-null",
        start: value.startIndex,
        end: value.endIndex,
        text: nullText,
        description: `\`return ${value.text}\` became \`return ${nullText}\``,
      });
  }
  return out;
}
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
const hasError = (n: Node): boolean =>
  n.type === "ERROR" || n.isMissing || kids(n).some(hasError) || n.children.some((c) => c?.isMissing);
/**
 * Injects one bug into a body, deterministically per symbol. Joints and hearts
 * are preferred (they are what players reason about). The mutated file must still parse.
 */
export async function mutate(built: BuiltBody, fileText: string, language: Language): Promise<Mutation | null> {
  const python = language === "python";
  const all: (Edit & { cellId: string })[] = [];
  for (const cell of built.body.cells) {
    if (cell.grouped) continue;
    const stmt = built.stmtOf.get(cell.id);
    if (!stmt) continue;
    const node = stmt.kind === "if" ? stmt.cond : stmt.node;
    if (node.startPosition.row + 1 !== cell.lines[0]) continue;
    for (const e of edits(node, python))
      if (
        fileText.slice(0, e.start).split("\n").length >= cell.lines[0] &&
        fileText.slice(0, e.end).split("\n").length <= cell.lines[1] &&
        (node.startPosition.row === node.endPosition.row || e.operator !== "swap-args")
      )
        all.push({ ...e, cellId: cell.id });
  }
  const rank = (cellId: string) => {
    const kind = built.body.cells.find((c) => c.id === cellId)?.kind;
    return kind === "joint" ? 0 : kind === "heart" ? 1 : 2;
  };
  const ordered = all.sort((a, b) => rank(a.cellId) - rank(b.cellId) || a.start - b.start);
  if (!ordered.length) return null;
  const preferred = ordered.filter((e) => rank(e.cellId) === rank(ordered[0]?.cellId ?? ""));
  const start = hash(built.body.symbolId) % preferred.length;
  for (let k = 0; k < ordered.length; k++) {
    const e = (k < preferred.length ? preferred[(start + k) % preferred.length] : ordered[k]) as Edit & {
      cellId: string;
    };
    const text = fileText.slice(0, e.start) + e.text + fileText.slice(e.end);
    const root = await parse(text, language);
    const def = findDefinition(
      root,
      built.definition.startPosition.row + 1,
      built.definition.startPosition.column + 1,
      built.definition.endPosition.row + 1,
    );
    if (!def || hasError(def)) continue;
    const line = fileText.slice(0, e.start).split("\n").length;
    return {
      operator: e.operator,
      cellId: e.cellId,
      line,
      original: fileText.split("\n")[line - 1] ?? "",
      mutated: text.split("\n")[line - 1] ?? "",
      description: e.description,
    };
  }
  return null;
}
