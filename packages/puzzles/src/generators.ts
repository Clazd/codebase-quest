import type { Question } from "@codebase-quest/combat";
import {
  type BuiltBody,
  calls,
  conditionInputs,
  evaluate,
  identifiers,
  literalConstants,
  type Mutation,
  NotEvaluable,
  type Stmt,
  same,
  show,
  truthy,
  type Value,
} from "@codebase-quest/combat/node";
import type { CodeGraph, LiteralValue } from "@codebase-quest/shared";
import type { Node } from "web-tree-sitter";

/** Everything a generator may look at. Answers come only from these facts. */
export interface PuzzleContext {
  built: BuiltBody;
  graph: Pick<CodeGraph, "symbols" | "edges" | "testFacts" | "files">;
  constants: ReadonlyMap<string, Value>;
  seed: string;
}
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** Deterministic shuffle: choice order is stable per seed and question. */
export function arrange(
  correct: string,
  wrong: readonly string[],
  key: string,
  max = 4,
): { choices: string[]; answer: number } {
  const distractors = [...new Set(wrong)].filter((w) => w !== correct).slice(0, max - 1);
  const all = [correct, ...distractors];
  let state = hash(key);
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j] as string, all[i] as string];
  }
  return { choices: all, answer: all.indexOf(correct) };
}
const at = (ctx: PuzzleContext, line: number) => `${ctx.built.body.path}:${line}`;
const cellOf = (ctx: PuzzleContext, id: string) => {
  const c = ctx.built.body.cells.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown cell ${id}`);
  return c;
};
const sym = (ctx: PuzzleContext) => [ctx.built.body.symbolId];
const KEYWORDS = new Set(
  "if else return const let var new this true false null undefined await async function typeof of in and or not None True False self".split(
    " ",
  ),
);
/** Distinct names in the function, in source order (identifiers and properties). */
function namesIn(node: Node): string[] {
  return [...new Set(identifiers(node).map((n) => n.text))].filter((n) => !KEYWORDS.has(n) && n.length > 1);
}
const scope = (ctx: PuzzleContext, args: readonly LiteralValue[]) => {
  const env = safeConstants(ctx);
  ctx.built.body.params.forEach((p, i) => {
    env.set(p, args[i] as Value);
  });
  return env;
};
function safeConstants(ctx: PuzzleContext): Map<string, Value> {
  return literalConstants(ctx.built, ctx.constants);
}

/** Fill the Gap: blank one name in a line; the source text is the ground truth. */
export function fillGap(ctx: PuzzleContext, cellId: string, action: Question["action"]): Question | null {
  const cell = cellOf(ctx, cellId);
  const stmt = ctx.built.stmtOf.get(cellId);
  if (!stmt) return null;
  const own = stmt.kind === "if" ? stmt.cond : stmt.node;
  const inCell = identifiers(own).filter(
    (n) =>
      n.startPosition.row + 1 >= cell.lines[0] &&
      n.startPosition.row + 1 <= cell.lines[1] &&
      !KEYWORDS.has(n.text) &&
      n.text.length > 1,
  );
  if (!inCell.length) return null;
  // Prefer the last name in the statement: usually the most meaningful.
  const target = inCell[inCell.length - 1] as Node;
  const targetLine = target.startPosition.row + 1;
  const lineText = ctx.built.body.code.lines[targetLine - ctx.built.body.code.startLine] ?? "";
  const col = target.startPosition.column;
  if (lineText.slice(col, col + target.text.length) !== target.text) return null;
  const blanked = `${lineText.slice(0, col)}_____${lineText.slice(col + target.text.length)}`.trim();
  const pool = namesIn(ctx.built.definition).filter((n) => n !== target.text);
  const fileId = ctx.graph.symbols.find((s) => s.id === ctx.built.body.symbolId)?.fileId;
  const others = ctx.graph.symbols.filter((s) => s.fileId === fileId).map((s) => s.name);
  const wrong = [...pool, ...others].filter(
    (n) => n !== target.text && !blanked.replace("_____", n).includes(`${n}${n}`),
  );
  if (wrong.length < 1) return null;
  const { choices, answer } = arrange(target.text, wrong, `${ctx.seed}:gap:${cellId}`);
  return {
    id: `${action}-${cellId}-gap`,
    type: "fill-gap",
    action,
    cellId,
    prompt: `Which name belongs in the blank? \`${blanked}\``,
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, targetLine),
    explanation: `Line ${targetLine} reads \`${lineText.trim()}\`.`,
    symbolIds: sym(ctx),
  };
}
/** Pierce fallback: which literal does this return line give back? Safe evaluator on a literal. */
export function literalReturn(ctx: PuzzleContext, heartId: string): Question | null {
  const stmt = ctx.built.stmtOf.get(heartId);
  if (stmt?.kind !== "return") return null;
  let value: Value;
  try {
    value = stmt.value ? evaluate(stmt.value, safeConstants(ctx)) : undefined;
  } catch {
    return null;
  }
  const cell = cellOf(ctx, heartId);
  const wrong = ["undefined", "null", "true", "false", "0", '""'].filter((w) => w !== show(value));
  const { choices, answer } = arrange(show(value), wrong, `${ctx.seed}:lit:${heartId}`);
  return {
    id: `pierce-${heartId}-literal`,
    type: "predict",
    action: "pierce",
    cellId: heartId,
    prompt: `Which value does line ${cell.lines[0]} return?`,
    choices,
    answer,
    scored: true,
    source: "evaluator",
    evidence: at(ctx, cell.lines[0]),
    explanation: `Line ${cell.lines[0]} returns the literal ${show(value)}.`,
    symbolIds: sym(ctx),
  };
}
/** Path Finder: which input makes this joint's condition true? Safe evaluator only. */
export function pathFinder(
  ctx: PuzzleContext,
  cellId: string,
  _candidates: readonly LiteralValue[][] = [],
  action: Question["action"] = "sever",
): Question | null {
  const stmt = ctx.built.stmtOf.get(cellId);
  if (stmt?.kind !== "if") return null;
  const results: { text: string; value: boolean }[] = [];
  for (const input of conditionInputs(ctx.built, ctx.constants, stmt.cond)) {
    const text = input.assignments
      .map(([path, v]) => `${path.endsWith(".length") ? path : path} = ${show(v)}`)
      .join(", ");
    if (results.some((r) => r.text === text)) continue;
    try {
      results.push({
        text,
        value: truthy(evaluate(stmt.cond, scope(ctx, input.args)), ctx.built.body.language === "python"),
      });
    } catch (error) {
      if (!(error instanceof NotEvaluable)) throw error;
    }
  }
  const yes = results.find((r) => r.value);
  const no = results.filter((r) => !r.value);
  if (!yes || no.length < 2) return null;
  const cell = cellOf(ctx, cellId);
  const { choices, answer } = arrange(
    yes.text,
    no.map((r) => r.text),
    `${ctx.seed}:pf:${cellId}`,
  );
  if (new Set(choices).size !== choices.length) return null;
  const condText = stmt.cond.text.replace(/\s+/g, " ");
  return {
    id: `${action}-${cellId}-pf`,
    type: "path-finder",
    action,
    cellId,
    prompt: `Which input makes \`${condText}\` true?`,
    choices,
    answer,
    scored: true,
    source: "evaluator",
    evidence: at(ctx, cell.lines[0]),
    explanation: `Substituting each input into \`${condText}\`: only ${yes.text} makes it true.`,
    symbolIds: sym(ctx),
  };
}
/** Predict: what does f(args) return? From a test assertion (or a literal heart on an evaluated path). */
export function predict(ctx: PuzzleContext, heartId: string): Question | null {
  const body = ctx.built.body;
  const input = body.inputs.find((i) => i.exitHeartId === heartId);
  if (!input) return null;
  const assertion = ctx.graph.testFacts.find(
    (t) => t.calleeSymbolId === body.symbolId && JSON.stringify(t.args) === JSON.stringify(input.args),
  );
  let expected: Value;
  let source: Question["source"];
  let evidence: string;
  if (assertion) {
    expected = assertion.expected as Value;
    source = "test-assertion";
    const file = ctx.graph.files.find((f) => f.id === assertion.testFileId);
    evidence = `${file?.path ?? "test"}:${assertion.line}`;
  } else {
    const stmt = ctx.built.stmtOf.get(heartId);
    if (stmt?.kind !== "return" || !stmt.value) return null;
    try {
      expected = evaluate(stmt.value, safeConstants(ctx));
    } catch {
      return null;
    }
    source = "evaluator";
    evidence = at(ctx, cellOf(ctx, heartId).lines[0]);
  }
  const wrong: string[] = [];
  for (const h of body.cells.filter((c) => c.kind === "heart")) {
    const s = ctx.built.stmtOf.get(h.id);
    if (s?.kind !== "return" || !s.value) continue;
    try {
      const v = evaluate(s.value, safeConstants(ctx));
      if (!same(v, expected)) wrong.push(show(v));
    } catch {}
  }
  for (const t of ctx.graph.testFacts)
    if (t.calleeSymbolId === body.symbolId && !same(t.expected as Value, expected))
      wrong.push(show(t.expected as Value));
  if (typeof expected === "number") wrong.push(String(expected + 1), String(expected - 1));
  if (typeof expected === "boolean") wrong.push(String(!expected));
  if (typeof expected === "string") wrong.push(show(""), "undefined");
  const call = `${body.name}(${input.args.map((a) => show(a as Value)).join(", ")})`;
  const { choices, answer } = arrange(show(expected), wrong, `${ctx.seed}:pr:${heartId}`);
  if (choices.length < 2) return null;
  return {
    id: `pierce-${heartId}-predict`,
    type: "predict",
    action: "pierce",
    cellId: heartId,
    inputId: input.id,
    prompt: `What does \`${call}\` return?`,
    choices,
    answer,
    scored: true,
    source,
    evidence,
    explanation:
      source === "test-assertion"
        ? `The test at ${evidence} asserts that \`${call}\` returns ${show(expected)}.`
        : `For this input the path ends at line ${cellOf(ctx, heartId).lines[0]}, which returns ${show(expected)}.`,
    symbolIds: sym(ctx),
  };
}
const pathText = (ctx: PuzzleContext, ids: readonly string[]) => ids.map((id) => cellOf(ctx, id).lines[0]).join(" → ");
/** Trace Strike: which lines run for input X? Path from the evaluator or a test assertion. */
export function pathQuestion(ctx: PuzzleContext, inputId: string): Question | null {
  const body = ctx.built.body;
  const input = body.inputs.find((i) => i.id === inputId);
  if (!input || input.pathCellIds.length < 2) return null;
  const correct = pathText(ctx, input.pathCellIds);
  const wrong = body.inputs
    .filter((i) => i.id !== inputId && i.pathCellIds.length >= 2)
    .map((i) => pathText(ctx, i.pathCellIds));
  // Near misses: drop the last decision before the exit, or end at another heart.
  const exits = body.cells.filter((c) => c.kind === "heart" && c.id !== input.exitHeartId);
  for (const h of exits) wrong.push(pathText(ctx, [...input.pathCellIds.slice(0, -1), h.id]));
  if (input.pathCellIds.length > 2) wrong.push(pathText(ctx, [...input.pathCellIds.slice(0, -2), input.exitHeartId]));
  const { choices, answer } = arrange(
    correct,
    wrong.filter((w) => w !== correct),
    `${ctx.seed}:path:${inputId}`,
  );
  if (choices.length < 2) return null;
  return {
    id: `trace-${inputId}-path`,
    type: "path",
    action: "trace",
    cellId: input.exitHeartId,
    inputId,
    prompt: `Which lines run for \`${input.telegraph}\`?`,
    choices,
    answer,
    scored: true,
    source: input.source === "test-assertion" ? "test-assertion" : "evaluator",
    evidence: input.evidence,
    explanation: `For \`${input.telegraph}\` the conditions send it along lines ${correct}.`,
    symbolIds: sym(ctx),
  };
}
/** Order the Steps: the order in which calls (or statements) appear in the function. */
export function orderSteps(ctx: PuzzleContext): Question | null {
  const found = calls(ctx.built.definition.childForFieldName("body") ?? ctx.built.definition);
  let steps = found
    .filter((c, i) => found.findIndex((other) => other.name === c.name) === i)
    .sort((a, b) => a.node.startIndex - b.node.startIndex)
    .map((c) => `${c.name}()`);
  let kind = "calls";
  if (steps.length < 3) {
    steps = ctx.built.body.cells.filter((c) => !c.grouped).map((c) => c.label);
    steps = [...new Set(steps)];
    kind = "statements";
  }
  if (steps.length < 3) return null;
  const picked = steps.slice(0, 4);
  const correct = picked.join(" → ");
  const wrong: string[] = [];
  for (let i = 0; i < picked.length - 1; i++) {
    const p = [...picked];
    [p[i], p[i + 1]] = [p[i + 1] as string, p[i] as string];
    wrong.push(p.join(" → "));
  }
  wrong.push([...picked].reverse().join(" → "));
  const { choices, answer } = arrange(correct, wrong, `${ctx.seed}:order:${ctx.built.body.symbolId}`);
  return {
    id: "trace-order",
    type: "order-steps",
    action: "trace",
    prompt: `In which order do these ${kind} appear in \`${ctx.built.body.name}\`, top to bottom?`,
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, ctx.built.body.code.startLine),
    explanation: `Reading the function from top to bottom: ${correct}.`,
    symbolIds: sym(ctx),
  };
}
/** Disable Organ: which function does this call reach? Exact call edge; choices are in-scope functions. */
export function calleeQuestion(ctx: PuzzleContext, organId: string): Question | null {
  const cell = cellOf(ctx, organId);
  if (cell.kind !== "organ" || !cell.calleeId) return null;
  const callee = ctx.graph.symbols.find((s) => s.id === cell.calleeId);
  if (!callee) return null;
  const file = ctx.graph.symbols.find((s) => s.id === ctx.built.body.symbolId)?.fileId;
  const sameFile = ctx.graph.symbols.filter((s) => s.fileId === file && s.kind !== "type" && s.kind !== "interface");
  const calledHere = new Set(
    ctx.graph.edges.filter((e) => e.from === ctx.built.body.symbolId && e.line === cell.lines[0]).map((e) => e.to),
  );
  const wrong = [...sameFile, ...ctx.graph.symbols.filter((s) => s.kind === "function")]
    .filter((s) => s.id !== callee.id && !calledHere.has(s.id) && s.name !== callee.name)
    .map((s) => s.name);
  const stmt = ctx.built.stmtOf.get(organId);
  const callNode = stmt && (stmt.kind === "decl" || stmt.kind === "expr") ? stmt.call : null;
  const fn = callNode?.childForFieldName("function");
  if (!callNode || !fn) return null;
  const line = ctx.built.body.code.lines[cell.lines[0] - ctx.built.body.code.startLine] ?? "";
  const nameNode = fn.childForFieldName("property") ?? fn.childForFieldName("attribute") ?? fn;
  const col = nameNode.startPosition.column;
  if (line.slice(col, col + nameNode.text.length) !== nameNode.text) return null;
  const blanked = `${line.slice(0, col)}_____${line.slice(col + nameNode.text.length)}`.trim();
  const { choices, answer } = arrange(callee.name, wrong, `${ctx.seed}:callee:${organId}`);
  if (choices.length < 2) return null;
  return {
    id: `disable-${organId}-callee`,
    type: "fill-gap",
    action: "disable",
    cellId: organId,
    prompt: `Which function does this call reach? \`${blanked}\``,
    choices,
    answer,
    scored: true,
    source: "call-graph",
    evidence: at(ctx, cell.lines[0]),
    explanation: `Line ${cell.lines[0]} calls \`${callee.name}\` (an exact call edge).`,
    symbolIds: [ctx.built.body.symbolId, callee.id],
  };
}
/** Type Sense (organ fallback): what type does the callee return? From its annotation. */
export function typeSense(ctx: PuzzleContext, organId: string): Question | null {
  const cell = cellOf(ctx, organId);
  const callee = ctx.graph.symbols.find((s) => s.id === cell.calleeId);
  if (!callee?.returnType) return null;
  const types = [...new Set(ctx.graph.symbols.flatMap((s) => (s.returnType ? [s.returnType] : [])))];
  const { choices, answer } = arrange(
    callee.returnType,
    [...types, "void", "string", "number", "boolean"],
    `${ctx.seed}:type:${organId}`,
  );
  return {
    id: `disable-${organId}-type`,
    type: "type-sense",
    action: "disable",
    cellId: organId,
    prompt: `What type does \`${callee.name}\` return?`,
    choices,
    answer,
    scored: true,
    source: "type-info",
    evidence: `${ctx.graph.files.find((f) => f.id === callee.fileId)?.path}:${callee.range.startLine}`,
    explanation: `\`${callee.name}\` is annotated to return \`${callee.returnType}\`.`,
    symbolIds: [ctx.built.body.symbolId, callee.id],
  };
}
/** Break Armor (Lost Error): which call sits inside this try block? Syntax tree. */
export function lostError(ctx: PuzzleContext, armorId: string): Question | null {
  const stmt = ctx.built.stmtOf.get(armorId);
  if (stmt?.kind !== "try") return null;
  const tryNode =
    stmt.node.type === "catch_clause" || stmt.node.type === "except_clause" ? stmt.node.parent : stmt.node;
  if (!tryNode) return null;
  const block = tryNode.childForFieldName("body");
  if (!block) return null;
  const inside = calls(block).map((c) => `${c.name}()`);
  const outsideAll = calls(ctx.built.definition)
    .filter((c) => c.node.startIndex < block.startIndex || c.node.endIndex > block.endIndex)
    .map((c) => `${c.name}()`);
  const correct = inside[0];
  if (!correct) return null;
  const others = ctx.graph.symbols.filter((s) => s.kind === "function").map((s) => `${s.name}()`);
  const wrong = [...outsideAll, ...others].filter((w) => !inside.includes(w));
  const { choices, answer } = arrange(correct, wrong, `${ctx.seed}:lost:${armorId}`);
  if (choices.length < 2) return null;
  const cell = cellOf(ctx, armorId);
  return {
    id: `armor-${armorId}-lost`,
    type: "lost-error",
    action: "armor",
    cellId: armorId,
    prompt: "Which of these calls appears inside the protected `try` block?",
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, cell.lines[0]),
    explanation: `The try block starting on line ${cell.lines[0]} contains \`${inside.join("`, `")}\`.`,
    symbolIds: sym(ctx),
  };
}
/** Who Calls? From the call graph; "Nobody" when the symbol has no callers. */
export function whoCalls(ctx: PuzzleContext, action: Question["action"] = "prove"): Question | null {
  const id = ctx.built.body.symbolId;
  const callers = [...new Set(ctx.graph.edges.filter((e) => e.kind === "calls" && e.to === id).map((e) => e.from))];
  const name = (sid: string) => ctx.graph.symbols.find((s) => s.id === sid)?.name ?? sid;
  const correct = callers.length ? name(callers[0] as string) : "Nobody";
  const callerNames = new Set(callers.map(name));
  const notCallers = ctx.graph.symbols
    .filter((s) => s.kind === "function" || s.kind === "method")
    .filter((s) => s.id !== id && !callers.includes(s.id) && !callerNames.has(s.name))
    .map((s) => s.name);
  const wrong = [...(callers.length ? ["Nobody"] : []), ...notCallers];
  const { choices, answer } = arrange(correct, wrong, `${ctx.seed}:who:${id}`);
  if (choices.length < 2) return null;
  return {
    id: `${action}-who-calls`,
    type: "who-calls",
    action,
    prompt: `Which of these has a recorded call edge to \`${ctx.built.body.name}\`?`,
    choices,
    answer,
    scored: true,
    source: "call-graph",
    evidence: at(ctx, ctx.built.body.code.startLine),
    explanation: callers.length
      ? `\`${correct}\` calls it (call graph).`
      : `There are no recorded callers of \`${ctx.built.body.name}\` in the static call graph. Dynamic uses require investigation.`,
    symbolIds: sym(ctx),
  };
}
/** Trace (library type): which function does this one call? Exact call graph. */
export function traceNext(ctx: PuzzleContext): Question | null {
  const id = ctx.built.body.symbolId;
  const callees = ctx.graph.edges
    .filter((e) => e.kind === "calls" && e.confidence === "exact" && e.from === id)
    .sort((a, b) => a.line - b.line);
  const first = callees[0];
  const callee = first ? ctx.graph.symbols.find((s) => s.id === first.to) : undefined;
  if (!first || !callee) return null;
  const called = new Set(callees.map((e) => e.to));
  const wrong = ctx.graph.symbols
    .filter((s) => (s.kind === "function" || s.kind === "method") && !called.has(s.id) && s.id !== id)
    .map((s) => s.name);
  const { choices, answer } = arrange(callee.name, wrong, `${ctx.seed}:next:${id}`);
  if (choices.length < 2) return null;
  return {
    id: "trace-next",
    type: "trace",
    action: "trace",
    prompt: `Which function has the first exact call edge recorded for \`${ctx.built.body.name}\` (line ${first.line})?`,
    choices,
    answer,
    scored: true,
    source: "call-graph",
    evidence: at(ctx, first.line),
    explanation: `Line ${first.line} calls \`${callee.name}\`.`,
    symbolIds: [id, callee.id],
  };
}
/** Mutant Hunt: which line was corrupted? The injected mutation is the ground truth. */
export function mutantHunt(ctx: PuzzleContext, mutation: Mutation): Question | null {
  const cells = ctx.built.body.cells.filter((c) => !c.grouped);
  const labelOf = (id: string) => {
    const c = cellOf(ctx, id);
    return id === mutation.cellId ? `line ${c.lines[0]}: ${mutation.mutated.trim()}` : `line ${c.lines[0]}: ${c.label}`;
  };
  const wrong = cells
    .filter((c) => c.id !== mutation.cellId && (c.kind === "joint" || c.kind === "heart" || c.kind === "body"))
    .map((c) => labelOf(c.id));
  const { choices, answer } = arrange(labelOf(mutation.cellId), wrong, `${ctx.seed}:mutant:${mutation.cellId}`);
  if (choices.length < 2) return null;
  return {
    id: "hunt-mutation",
    type: "mutant-hunt",
    action: "hunt",
    cellId: mutation.cellId,
    prompt: "One line of this body was corrupted. Which one?",
    choices,
    answer,
    scored: true,
    source: "mutation",
    evidence: `${ctx.built.body.path}:${mutation.line}`,
    explanation: `In the real code line ${mutation.line} is \`${mutation.original.trim()}\`; the Mutant changed it: ${mutation.description}.`,
    symbolIds: sym(ctx),
  };
}
/** Maze (Minotaur): which conditions lead to the deepest cell? Its enclosing headers in the syntax tree. */
export function maze(ctx: PuzzleContext): Question | null {
  const cells = ctx.built.body.cells;
  const deepest = [...cells].sort((a, b) => b.col - a.col || a.row - b.row)[0];
  if (!deepest || deepest.col < 2) return null;
  const chain: string[] = [];
  const limbs = ctx.built.body.limbs.filter((l) => l.cellIds.includes(deepest.id));
  for (const l of limbs.sort((a, b) => cellOf(ctx, a.jointId).row - cellOf(ctx, b.jointId).row)) {
    const joint = ctx.built.stmtOf.get(l.jointId);
    const negative = joint?.kind === "if" && joint.else && containsCell(ctx, joint.else, deepest.id);
    const label = cellOf(ctx, l.jointId).label;
    chain.push(negative ? `not (${label})` : label);
  }
  // The deepest cell may sit in an `else`: then its joint's condition must be false.
  const owner = limbs.at(-1);
  const ownerStmt = owner ? ctx.built.stmtOf.get(owner.jointId) : undefined;
  const inElse = ownerStmt?.kind === "if" && ownerStmt.else !== null && containsCell(ctx, ownerStmt.else, deepest.id);
  if (chain.length < 2) return null;
  const correct = chain.join(" ∧ ");
  const wrong: string[] = [];
  wrong.push(chain.slice(1).join(" ∧ "));
  wrong.push(chain.slice(0, -1).join(" ∧ "));
  if (!inElse) wrong.push([...chain.slice(0, -1), `not (${chain.at(-1)})`].join(" ∧ "));
  else wrong.push([...chain.slice(0, -1), (chain.at(-1) ?? "").replace(/^not \((.*)\)$/, "$1")].join(" ∧ "));
  const { choices, answer } = arrange(correct, wrong, `${ctx.seed}:maze:${deepest.id}`);
  return {
    id: "maze-deepest",
    type: "maze",
    action: "maze",
    cellId: deepest.id,
    prompt: `Which headers must all let you through to reach line ${deepest.lines[0]} (the deepest cell)?`,
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, deepest.lines[0]),
    explanation: `Line ${deepest.lines[0]} is nested inside: ${correct}.`,
    symbolIds: sym(ctx),
  };
}
function containsCell(ctx: PuzzleContext, stmts: readonly Stmt[], cellId: string): boolean {
  for (const s of stmts) {
    if (ctx.built.cellOf.get(s) === cellId) return true;
    if (s.kind === "if" && (containsCell(ctx, s.consequent, cellId) || (s.else && containsCell(ctx, s.else, cellId))))
      return true;
    if (s.kind === "loop" && containsCell(ctx, s.body, cellId)) return true;
    if (
      s.kind === "try" &&
      (containsCell(ctx, s.body, cellId) || (s.catchClause && containsCell(ctx, s.catchClause.body, cellId)))
    )
      return true;
  }
  return false;
}
/** Field Sense (Shapeshifter): which fields does the code read from an untyped parameter? */
export function fieldSense(ctx: PuzzleContext, param: string): Question | null {
  const fields = new Set<string>();
  const visit = (n: Node) => {
    if (n.type === "member_expression" || n.type === "attribute") {
      const obj = n.childForFieldName("object");
      const prop = n.childForFieldName("property") ?? n.childForFieldName("attribute");
      if (obj?.type === "identifier" && obj.text === param && prop) fields.add(prop.text);
    }
    for (const c of n.namedChildren) if (c) visit(c);
  };
  visit(ctx.built.definition.childForFieldName("body") ?? ctx.built.definition);
  const list = [...fields];
  if (list.length < 2) return null;
  const shown = list.slice(0, 4);
  const correct = shown.join(", ");
  const decoys = ["name", "value", "type", "data", "count", "status", "total"].filter((d) => !fields.has(d));
  const wrong = [
    [...shown.slice(0, -1), decoys[0]].join(", "),
    [...shown.slice(1), decoys[1]].join(", "),
    [decoys[2], ...shown.slice(1)].join(", "),
  ];
  const { choices, answer } = arrange(correct, wrong, `${ctx.seed}:fields:${param}`);
  return {
    id: `shape-${param}`,
    type: "field-sense",
    action: "shape",
    prompt: `\`${param}\` has no real type. Which fields does this function read from it?`,
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, ctx.built.body.code.startLine),
    explanation: `The body reads \`${param}.${shown.join(`\`, \`${param}.`)}\`: that is the shape its type should describe.`,
    symbolIds: sym(ctx),
  };
}
/** Echo: on which line is this parameter used? Identifier references in the syntax tree. */
export function echo(ctx: PuzzleContext, param: string): Question | null {
  const body = ctx.built.definition.childForFieldName("body");
  if (!body) return null;
  const lines = [
    ...new Set(
      identifiers(body)
        .filter((n) => n.type !== "property_identifier" && n.text === param)
        .map((n) => n.startPosition.row + 1),
    ),
  ];
  if (lines.length !== 1) return null;
  const line = lines[0] as number;
  const text = (l: number) =>
    `line ${l}: ${(ctx.built.body.code.lines[l - ctx.built.body.code.startLine] ?? "").trim()}`;
  const candidates: number[] = [];
  const start = body.startPosition.row + 1,
    end = body.endPosition.row + 1;
  for (let l = start; l <= end; l++) {
    const t = (ctx.built.body.code.lines[l - ctx.built.body.code.startLine] ?? "").trim();
    if (l !== line && t.length > 3 && !new RegExp(`\\b${param}\\b`).test(t)) candidates.push(l);
  }
  const { choices, answer } = arrange(text(line), candidates.map(text), `${ctx.seed}:echo:${param}`);
  if (choices.length < 2) return null;
  return {
    id: `match-${param}`,
    type: "echo",
    action: "match",
    prompt: `Which line uses the parameter \`${param}\`?`,
    choices,
    answer,
    scored: true,
    source: "ast",
    evidence: at(ctx, line),
    explanation: `\`${param}\` is used on line ${line}.`,
    symbolIds: sym(ctx),
  };
}
/** Mimic: which line differs between the twins? From a line diff of the two bodies. */
export function compareTwins(a: PuzzleContext, b: PuzzleContext, diffCellId: string): Question | null {
  const cellA = a.built.body.cells.find((c) => c.id === diffCellId);
  const cellB = b.built.body.cells.find((c) => c.row === cellA?.row && c.col === cellA?.col);
  if (!cellA || !cellB) return null;
  const correct = `line ${cellA.lines[0]}: ${cellA.label}`;
  const wrong = a.built.body.cells
    .filter((c) => !c.twinDiff && c.id !== diffCellId)
    .map((c) => `line ${c.lines[0]}: ${c.label}`);
  const { choices, answer } = arrange(correct, wrong, `${a.seed}:twins:${diffCellId}`);
  if (choices.length < 2) return null;
  return {
    id: "compare-twins",
    type: "compare",
    action: "compare",
    cellId: diffCellId,
    prompt: `\`${a.built.body.name}\` and \`${b.built.body.name}\` are near-copies. Which line of the first one differs from its twin?`,
    choices,
    answer,
    scored: true,
    source: "diff",
    evidence: `${a.built.body.path}:${cellA.lines[0]} vs ${b.built.body.path}:${cellB.lines[0]}`,
    explanation: `This cell differs: \`${cellA.label}\` vs \`${cellB.label}\`.`,
    symbolIds: [a.built.body.symbolId, b.built.body.symbolId],
  };
}
/** Opinion questions: XP only, never `understood`. */
export function opinion(
  id: string,
  type: "classify-todo" | "name-constant" | "investigate",
  action: Question["action"],
  prompt: string,
  choices: string[],
  evidence: string,
  explanation: string,
  symbolIds: string[],
  cellId?: string,
): Question {
  return {
    id,
    type,
    action,
    ...(cellId ? { cellId } : {}),
    prompt,
    choices,
    answer: null,
    scored: false,
    source: "opinion",
    evidence,
    explanation,
    symbolIds,
  };
}
