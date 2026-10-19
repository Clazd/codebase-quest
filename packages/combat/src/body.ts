import type { Node } from "web-tree-sitter";
import { functionStatements, parameterNames, type Stmt } from "./ast.ts";
import { type Cell, type CellKind, type CodeBody, CodeBodySchema, type Limb, MAX_CELLS } from "./schema.ts";

export interface CallEdge {
  line: number;
  toId: string;
  toName: string;
}
export interface BuildInput {
  definition: Node;
  symbolId: string;
  name: string;
  path: string;
  language: string;
  /** The whole file's lines, secrets masked. */
  fileLines: readonly string[];
  /** Exact call edges from this symbol (line + callee). */
  edges: readonly CallEdge[];
}
/** A built body plus the statement behind each cell (kept in memory for the evaluator and generators). */
export interface BuiltBody {
  body: CodeBody;
  stmts: Stmt[];
  cellOf: Map<Stmt, string>;
  stmtOf: Map<string, Stmt>;
  definition: Node;
}
const tokens = (text: string) =>
  text.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`|[^\s\w]/g)?.length ?? 0;
const hpOf = (text: string): 1 | 2 | 3 => {
  const n = tokens(text);
  return n <= 8 ? 1 : n <= 20 ? 2 : 3;
};
const label = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim().replace(/;$/, "");
  return one.length > 80 ? `${one.slice(0, 79)}…` : one;
};
type Raw = Omit<Cell, "id" | "row" | "limbId"> & { stmt: Stmt; parents: number[]; key: number };

/**
 * Syntax tree → CodeBody (MASTER-PLAN §7.1–7.2, P07 builder rules): one cell per
 * statement, row = order of appearance, col = nesting depth; joints own limbs;
 * returns/throws are hearts; calls with an exact edge are organs; try/catch is
 * armor. Grouping keeps bodies at most 40 cells. Deterministic.
 */
export function buildBody(input: BuildInput): BuiltBody {
  const stmts = functionStatements(input.definition);
  const raws: Raw[] = [];
  /** For each joint (by raw index): the raw indexes nested under it. */
  const owned = new Map<number, number[]>();
  // Multiple callees on one line are ambiguous: the graph has no call column.
  const edgeAt = (line: number) => {
    const edges = input.edges.filter((e) => e.line === line);
    return edges.length === 1 ? edges[0] : undefined;
  };
  /** Joints before the current point, per enclosing block, that can exit (contain a heart). */
  type Frame = { exitJoints: number[] };
  const exits = new Set<number>();
  function emit(stmt: Stmt, col: number, parents: number[], frames: Frame[]): number {
    let kind: CellKind = "body";
    let calleeId: string | undefined;
    let calleeName: string | undefined;
    if (stmt.kind === "if" || stmt.kind === "loop") kind = "joint";
    else if (stmt.kind === "return" || stmt.kind === "throw") kind = "heart";
    else if (stmt.kind === "try") kind = "armor";
    else if ((stmt.kind === "decl" || stmt.kind === "expr") && stmt.call) {
      const edge = edgeAt(stmt.call.startPosition.row + 1);
      if (edge) {
        kind = "organ";
        calleeId = edge.toId;
        calleeName = edge.toName;
      }
    }
    const index = raws.length;
    const raw: Raw = {
      key: index,
      stmt,
      parents,
      col,
      kind,
      // Compound statements show their header; simple ones span their whole text.
      lines: [
        stmt.startLine,
        kind === "joint" || kind === "armor" ? Math.max(stmt.startLine, stmt.headerEnd) : stmt.endLine,
      ],
      hp: hpOf(stmt.text),
      label: label(stmt.text),
      ...(calleeId ? { calleeId, calleeName } : {}),
    };
    if (kind === "heart") {
      const guards = new Set<number>(parents.filter((p) => raws[p]?.kind === "joint"));
      for (const frame of frames) for (const j of frame.exitJoints) guards.add(j);
      raw.guardJointIds = [...guards].sort((a, b) => a - b).map(String);
      for (const p of parents) exits.add(p);
    }
    raws.push(raw);
    for (const p of parents) owned.get(p)?.push(index);
    if (kind === "joint") owned.set(index, []);
    return index;
  }
  function walk(list: Stmt[], col: number, parents: number[], frames: Frame[]) {
    const frame: Frame = { exitJoints: [] };
    const inner = [...frames, frame];
    for (const stmt of list) {
      if (stmt.kind === "break") continue;
      if (stmt.kind === "switch") {
        // Each case is a joint at the switch's depth; its statements nest under it.
        for (const c of stmt.cases) {
          const fake: Stmt = {
            ...c,
            kind: "if",
            cond: c.test ?? stmt.value,
            consequent: c.body,
            else: null,
            elseIf: false,
          };
          const j = emit(fake, col, parents, inner);
          walk(c.body, col + 1, [...parents, j], inner);
          if (exits.has(j)) frame.exitJoints.push(j);
        }
        continue;
      }
      const index = emit(stmt, col, parents, inner);
      if (stmt.kind === "if") {
        walk(stmt.consequent, col + 1, [...parents, index], inner);
        if (stmt.else) {
          const elseIf = stmt.else.length === 1 && stmt.else[0]?.kind === "if" && stmt.else[0].elseIf;
          // An `else if` is the next decision of the same chain: same depth, owned by this joint.
          walk(stmt.else, elseIf ? col : col + 1, [...parents, index], inner);
        }
        if (exits.has(index)) frame.exitJoints.push(index);
      } else if (stmt.kind === "loop") {
        walk(stmt.body, col + 1, [...parents, index], inner);
        if (exits.has(index)) frame.exitJoints.push(index);
      } else if (stmt.kind === "try") {
        walk(stmt.body, col + 1, parents, inner);
        if (stmt.catchClause) {
          const c = stmt.catchClause;
          const fake: Stmt = { ...c, kind: "try", text: c.text, body: c.body, catchClause: null, finally: null };
          emit(fake, col, parents, inner);
          walk(c.body, col + 1, parents, inner);
        }
        if (stmt.finally) walk(stmt.finally, col + 1, parents, inner);
      }
    }
  }
  walk(stmts, 0, [], []);
  let cells = raws;
  // Grouping: merge the longest run of consecutive plain body cells at the deepest level.
  let merges = 0;
  while (cells.length > MAX_CELLS && merges < 200) {
    merges++;
    const deepest = Math.max(...cells.filter((c) => c.kind === "body").map((c) => c.col));
    let best: [number, number] | null = null;
    for (let i = 0; i < cells.length; ) {
      let j = i;
      const same = (k: number) => {
        const c = cells[k];
        const first = cells[i];
        return c && first && c.kind === "body" && c.col === deepest && c.parents.join() === first.parents.join();
      };
      while (j < cells.length && same(j)) j++;
      if (j - i >= 2 && (!best || j - i > best[1] - best[0])) best = [i, j];
      i = Math.max(j, i + 1);
    }
    if (!best) {
      // No mergeable run at the deepest level: merge the deepest body cells with their next sibling run anywhere.
      const anyRun = findAnyRun(cells);
      if (!anyRun) break;
      best = anyRun;
    }
    const [from, to] = best;
    const group = cells.slice(from, to);
    const first = group[0] as Raw;
    const last = group.at(-1) as Raw;
    const n = group.reduce((sum, c) => sum + (c.grouped ?? 1), 0);
    const merged: Raw = {
      ...first,
      lines: [first.lines[0], last.lines[1]],
      label: `▤ ${n} statements`,
      grouped: n,
      hp: 3,
    };
    cells = [...cells.slice(0, from), merged, ...cells.slice(to)];
  }
  // IDs, rows and limbs.
  const ordered = [...cells].sort((a, b) => a.lines[0] - b.lines[0] || a.col - b.col || a.key - b.key);
  const rowOf = new Map([...new Set(ordered.map((c) => c.lines[0]))].sort((a, b) => a - b).map((l, i) => [l, i]));
  const idOf = new Map(ordered.map((c, i) => [c.key, `c${i + 1}`]));
  const limbs: Limb[] = [];
  const limbOfJoint = new Map<number, string>();
  for (const c of ordered)
    if (c.kind === "joint") {
      const id = `L${limbs.length + 1}`;
      limbOfJoint.set(c.key, id);
      limbs.push({
        id,
        jointId: idOf.get(c.key) ?? "",
        cellIds: (owned.get(c.key) ?? []).flatMap((k) => (idOf.has(k) ? [idOf.get(k) as string] : [])),
      });
    }
  const out: Cell[] = ordered.map((c) => {
    const parent = [...c.parents].reverse().find((p) => limbOfJoint.has(p) && idOf.has(p));
    const { stmt: _s, parents: _p, key: _k, ...rest } = c;
    const ancestors = new Set<number>();
    let ancestor = c.stmt.node.parent;
    while (ancestor) {
      if (ancestor.type === "try_statement") ancestors.add(ancestor.id);
      ancestor = ancestor.parent;
    }
    const armor =
      c.kind === "armor"
        ? []
        : ordered
            .filter(
              (a) =>
                a.kind === "armor" &&
                (ancestors.has(a.stmt.node.id) || (a.stmt.node.parent && ancestors.has(a.stmt.node.parent.id))),
            )
            .flatMap((a) => {
              const id = idOf.get(a.key);
              return id ? [id] : [];
            });
    return {
      ...rest,
      id: idOf.get(c.key) ?? "",
      row: rowOf.get(c.lines[0]) ?? 0,
      ...(armor.length ? { guardArmorIds: armor } : {}),
      ...(parent !== undefined ? { limbId: limbOfJoint.get(parent) } : {}),
      ...(c.guardJointIds
        ? {
            guardJointIds: c.guardJointIds.flatMap((g) => (idOf.has(Number(g)) ? [idOf.get(Number(g)) as string] : [])),
          }
        : {}),
    };
  });
  const start = input.definition.startPosition.row + 1,
    end = input.definition.endPosition.row + 1;
  const body = CodeBodySchema.parse({
    id: input.symbolId,
    symbolId: input.symbolId,
    name: input.name,
    path: input.path,
    language: input.language,
    params: parameterNames(input.definition),
    code: { startLine: start, lines: input.fileLines.slice(start - 1, end) },
    cells: out.length
      ? out
      : [
          {
            id: "c1",
            row: 0,
            col: 0,
            kind: "body",
            lines: [start, start],
            hp: 1,
            label: label(input.fileLines[start - 1] ?? input.name),
          },
        ],
    limbs,
    inputs: [],
  });
  const cellOf = new Map<Stmt, string>();
  const stmtOf = new Map<string, Stmt>();
  for (const c of ordered) {
    const id = idOf.get(c.key);
    if (id && !c.grouped) {
      cellOf.set(c.stmt, id);
      stmtOf.set(id, c.stmt);
    }
  }
  return { body, stmts, cellOf, stmtOf, definition: input.definition };
}
function findAnyRun(cells: Raw[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (let i = 0; i < cells.length; ) {
    const first = cells[i];
    let j = i;
    while (
      j < cells.length &&
      cells[j]?.kind === "body" &&
      first?.kind === "body" &&
      cells[j]?.col === first.col &&
      cells[j]?.parents.join() === first.parents.join()
    )
      j++;
    if (j - i >= 2 && (!best || j - i > best[1] - best[0])) best = [i, j];
    i = Math.max(j, i + 1);
  }
  return best;
}
