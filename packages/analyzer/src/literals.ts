import type { LiteralValue } from "@codebase-quest/shared";
import type { Node } from "web-tree-sitter";
export const NOT_LITERAL = Symbol("not-literal");

export function stringValue(raw: string): string | typeof NOT_LITERAL {
  if (!/^(?:"[\s\S]*"|'[\s\S]*')$/.test(raw) || raw.startsWith('"""') || raw.startsWith("'''")) return NOT_LITERAL;
  const inside = raw.slice(1, -1);
  try {
    if (raw[0] === '"') return JSON.parse(raw) as string;
    return JSON.parse(`"${inside.replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"')}"`) as string;
  } catch {
    return NOT_LITERAL;
  }
}
/** Syntax-only literal decoding. No eval, VM, import or repository calls. */
export function literal(node: Node | null): LiteralValue | typeof NOT_LITERAL {
  if (!node) return NOT_LITERAL;
  if (["true", "false", "none", "null"].includes(node.type))
    return { true: true, false: false, none: null, null: null }[node.type] as LiteralValue;
  if (["number", "integer", "float"].includes(node.type)) {
    if (!/^(?:\d[\d_]*(?:\.[\d_]*)?(?:e[+-]?\d+)?|0[xob][\da-f_]+)$/i.test(node.text)) return NOT_LITERAL;
    const value = Number(node.text.replaceAll("_", ""));
    return Number.isFinite(value) ? value : NOT_LITERAL;
  }
  if (node.type === "unary_expression" || node.type === "unary_operator") {
    const value = literal(node.namedChildren.at(-1) ?? null);
    return typeof value === "number" && /^-\s*/.test(node.text) ? -value : NOT_LITERAL;
  }
  if (node.type === "string") return stringValue(node.text);
  if (["array", "list", "tuple"].includes(node.type)) {
    const values = node.namedChildren.map(literal);
    return values.includes(NOT_LITERAL) ? NOT_LITERAL : (values as LiteralValue[]);
  }
  if (["object", "dictionary"].includes(node.type)) {
    const value: Record<string, LiteralValue> = Object.create(null) as Record<string, LiteralValue>;
    for (const pair of node.namedChildren) {
      if (pair.type !== "pair") return NOT_LITERAL;
      const key = pair.childForFieldName("key");
      const item = literal(pair.childForFieldName("value"));
      const name =
        key?.type === "string"
          ? stringValue(key.text)
          : key && ["property_identifier", "identifier"].includes(key.type)
            ? key.text
            : NOT_LITERAL;
      if (name === NOT_LITERAL || item === NOT_LITERAL || ["__proto__", "constructor", "prototype"].includes(name))
        return NOT_LITERAL;
      value[name] = item;
    }
    return value;
  }
  return NOT_LITERAL;
}
