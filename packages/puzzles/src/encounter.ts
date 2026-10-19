import {
  type BodyInput,
  type Cell,
  type CodeBody,
  type Encounter,
  EncounterSchema,
  type MonsterKind,
  type Question,
} from "@codebase-quest/combat";
import {
  assertionInputs,
  type BuiltBody,
  buildBody,
  candidateInputs,
  evaluatorInputs,
  exactEdges,
  findDefinition,
  type Mutation,
  moduleConstants,
  mutate,
  parse,
  type Value,
} from "@codebase-quest/combat/node";
import type {
  CodeGraph,
  Language,
  LiteralValue,
  Smell,
  SymbolNode,
  WorldModel,
  WorldPosition,
} from "@codebase-quest/shared";
import {
  calleeQuestion,
  compareTwins,
  echo,
  fieldSense,
  fillGap,
  literalReturn,
  lostError,
  maze,
  mutantHunt,
  opinion,
  orderSteps,
  type PuzzleContext,
  pathFinder,
  pathQuestion,
  predict,
  traceNext,
  typeSense,
  whoCalls,
} from "./generators.ts";

export type Graph = Pick<CodeGraph, "symbols" | "edges" | "testFacts" | "files" | "smells">;
/** File text the analyzer read (secrets masked by the caller); never executed. */
export type Sources = (path: string) => { text: string; language: Language } | null;
export const KIND_OF: Record<string, MonsterKind | "golem" | "titan" | "ouroboros"> = {
  "todo-comment": "gremlin",
  "complex-function": "serpent",
  "duplicate-code": "mimic",
  "injected-mutation": "mutant",
  "dead-code": "ghost",
  "possibly-dead-code": "wisp",
  "deep-nesting": "minotaur",
  "magic-number": "imp",
  "swallowed-error": "wraith",
  "missing-types": "shapeshifter",
  "long-parameter-list": "echo",
  "untested-code": "shadow",
  "huge-file": "golem",
  "god-class": "titan",
  "circular-dependency": "ouroboros",
};
const PROFILE: Record<
  MonsterKind,
  {
    name: string;
    frame: number;
    teaches: string;
    attack: [string, string];
    twist: Encounter["twist"]["kind"];
    twistText: string;
  }
> = {
  gremlin: {
    name: "Gremlin",
    frame: 124,
    teaches: "Known debt",
    attack: ["Nag", "The Gremlin chants its TODO at you."],
    twist: "todo",
    twistText: "A glowing TODO cell. Classify it to calm the Gremlin.",
  },
  serpent: {
    name: "Spaghetti Serpent",
    frame: 110,
    teaches: "Structure",
    attack: ["Tangle", "The Serpent wraps you in tangled branches."],
    twist: "none",
    twistText: "Long, winding limbs: severing joints is the key.",
  },
  mimic: {
    name: "Mimic",
    frame: 92,
    teaches: "Duplication",
    attack: ["Copycat glare", "The Mimic mirrors your every move."],
    twist: "mirror",
    twistText: "Two mirrored grids. The line that differs is its weak point.",
  },
  mutant: {
    name: "Mutant",
    frame: 109,
    teaches: "Spotting bugs",
    attack: ["Corruption", "The corruption spreads to a neighboring cell."],
    twist: "mutation",
    twistText: "One line is corrupted (a real injected bug). Find it.",
  },
  ghost: {
    name: "Ghost",
    frame: 121,
    teaches: "Unused code",
    attack: ["Chill", "A cold draft from forgotten code."],
    twist: "no-tethers",
    twistText: "No tethers to any caller. Prove nobody calls it and it fades.",
  },
  wisp: {
    name: "Wisp",
    frame: 108,
    teaches: "Uncertainty",
    attack: ["Flicker", "The Wisp flickers out of reach."],
    twist: "flicker",
    twistText: "It might be dead, or called by name at runtime. Investigate and report.",
  },
  minotaur: {
    name: "Labyrinth Minotaur",
    frame: 111,
    teaches: "Readability",
    attack: ["Charge", "The Minotaur charges through its maze."],
    twist: "maze",
    twistText: "The grid is a maze. Trace your way to the deepest cell.",
  },
  imp: {
    name: "Imp",
    frame: 120,
    teaches: "Naming",
    attack: ["Sparkle", "A magic number sparkles in your eyes."],
    twist: "sparkle",
    twistText: "A sparkling literal with no name. Name it to calm the Imp.",
  },
  wraith: {
    name: "Wraith",
    frame: 121,
    teaches: "Error handling",
    attack: ["Silence", "The Wraith swallows your strike without a sound."],
    twist: "armor",
    twistText: "Covered in armor: errors vanish inside.",
  },
  shapeshifter: {
    name: "Shapeshifter",
    frame: 122,
    teaches: "Types",
    attack: ["Shift", "Its cells change shape: the untyped value could be anything."],
    twist: "shapeshift",
    twistText: "Untyped parameters. Name the shape it really reads.",
  },
  echo: {
    name: "Echo",
    frame: 123,
    teaches: "API design",
    attack: ["Chorus", "Too many voices shout parameters at you."],
    twist: "voices",
    twistText: "Extra voices: match parameters to the lines that use them.",
  },
  shadow: {
    name: "Shadow",
    frame: 111,
    teaches: "Testing",
    attack: ["Darkness", "Untested code hides in the dark."],
    twist: "shadow",
    twistText: "Dark cells no test has ever lit. Light them by reasoning.",
  },
};
const FIX: Record<string, string> = {
  "todo-comment": "Turn the TODO into a tracked issue, or do it now while you understand the code.",
  "complex-function": "Split the function: extract each decision into a small, named helper and test each one.",
  "duplicate-code": "Extract the shared logic into one function and keep only the real difference as a parameter.",
  "injected-mutation": "Tests that assert exact results catch bugs like this one: add one for each branch.",
  "dead-code": "Delete it (version control remembers), or document why it must stay.",
  "possibly-dead-code":
    "Search for dynamic uses (string names, configs, plugins). Delete it if none, or make the registration explicit.",
  "deep-nesting":
    "Return early for the edge cases and extract the inner loop body, so the happy path reads top to bottom.",
  "magic-number": "Give the literal a name that explains it (a constant next to its meaning).",
  "swallowed-error": "Handle the error, log it, or let it propagate: an empty catch hides failures.",
  "missing-types": "Describe the parameter's real shape with a type, so mistakes fail at compile time.",
  "long-parameter-list": "Group related parameters into an options object with named fields.",
  "untested-code": "Add a test for each branch: start with the inputs this fight used.",
};
const KIND_LABEL: Record<Cell["kind"], string> = {
  joint: "joint",
  body: "cell",
  organ: "organ",
  armor: "armor",
  heart: "heart",
};

interface Source {
  path: string;
  text: string;
  lines: string[];
  language: Language;
}
async function built(graph: Graph, symbol: SymbolNode, source: Source) {
  const root = await parse(source.text, source.language);
  const definition = findDefinition(root, symbol.range.startLine, symbol.range.startColumn, symbol.range.endLine);
  if (!definition) return null;
  const b = buildBody({
    definition,
    symbolId: symbol.id,
    name: symbol.name,
    path: source.path,
    language: source.language,
    fileLines: source.lines,
    edges: exactEdges(graph, symbol.id),
  });
  return { b, constants: moduleConstants(root) };
}
function sourceFor(graph: Graph, sources: Sources, symbol: SymbolNode): Source | null {
  const file = graph.files.find((f) => f.id === symbol.fileId);
  if (!file?.language) return null;
  const s = sources(file.path);
  if (!s) return null;
  return { path: file.path, text: s.text, lines: s.text.split("\n"), language: s.language };
}
/** Inputs (test assertions first, then evaluator boundaries), at most six, unique by exit+path. */
function inputsFor(graph: Graph, b: BuiltBody, constants: ReadonlyMap<string, Value>): BodyInput[] {
  const path = (fileId: string) => graph.files.find((f) => f.id === fileId)?.path ?? "test";
  const all = [...assertionInputs(b, graph.testFacts, constants, path), ...evaluatorInputs(b, constants)];
  const out: BodyInput[] = [];
  for (const i of all)
    if (!out.some((o) => o.exitHeartId === i.exitHeartId && o.pathCellIds.join() === i.pathCellIds.join())) out.push(i);
  return out.slice(0, 6);
}
/** Scored questions for every cell of a body, each with a ground-truth fallback. */
function cellQuestions(ctx: PuzzleContext, candidates: LiteralValue[][]): Question[] {
  const out: Question[] = [];
  const push = (q: Question | null) => {
    if (q && !out.some((x) => x.id === q.id)) out.push(q);
  };
  for (const cell of ctx.built.body.cells) {
    if (cell.grouped) continue;
    if (cell.kind === "joint")
      push(
        pathFinder(ctx, cell.id, [...ctx.built.body.inputs.map((i) => i.args), ...candidates]) ??
          fillGap(ctx, cell.id, "sever"),
      );
    if (cell.kind === "organ")
      push(calleeQuestion(ctx, cell.id) ?? typeSense(ctx, cell.id) ?? fillGap(ctx, cell.id, "disable"));
    if (cell.kind === "armor") push(lostError(ctx, cell.id) ?? fillGap(ctx, cell.id, "armor"));
    if (cell.kind === "heart")
      push(predict(ctx, cell.id) ?? fillGap(ctx, cell.id, "pierce") ?? literalReturn(ctx, cell.id));
  }
  for (const cell of ctx.built.body.cells)
    if (cell.kind === "body" && !cell.grouped) push(fillGap(ctx, cell.id, "trace"));
  for (const input of ctx.built.body.inputs) push(pathQuestion(ctx, input.id));
  push(orderSteps(ctx) ?? traceNext(ctx));
  // A body with nothing else to ask (an empty class): the call graph still knows who uses it.
  if (!out.some((q) => q.scored)) push(whoCalls(ctx, "trace"));
  return out;
}
/** The hint ladder for a cell: evidence only; it never contains the answer. */
function hintsFor(ctx: PuzzleContext, questions: Question[]): Encounter["hints"] {
  const hints: Encounter["hints"] = {};
  for (const cell of ctx.built.body.cells) {
    const q = questions.find((x) => x.cellId === cell.id && x.scored);
    const nudge =
      cell.kind === "joint"
        ? "A joint decides where execution goes. What has to be true here?"
        : cell.kind === "heart"
          ? "A heart is an exit. Which inputs end up here?"
          : cell.kind === "organ"
            ? "An organ calls another function. Which one does it reach?"
            : cell.kind === "armor"
              ? "Armor protects calls inside a try. Which calls are inside?"
              : "Read the line: what does it change for the rest of the function?";
    const how =
      q?.type === "path-finder"
        ? "Substitute each input's values into the condition and check it."
        : q?.type === "predict" && q.source === "test-assertion"
          ? `The project's own test at ${q.evidence} pins this down. Look there.`
          : q?.type === "fill-gap" || q?.type === "lost-error"
            ? `Open the Code Panel at ${q.evidence} and read the exact text.`
            : `Follow the code at ${q?.evidence ?? `${ctx.built.body.path}:${cell.lines[0]}`}.`;
    hints[cell.id] = {
      nudge,
      pointer: {
        text: `Look at line ${cell.lines[0]}: the ${KIND_LABEL[cell.kind]} \`${cell.label}\`.`,
        lines: [[cell.lines[0], cell.lines[1]]],
        cellIds: [cell.id],
      },
      explanation: how,
    };
  }
  return hints;
}
/** A minion: the callee's body, cut to at most five cells (hearts kept). */
async function minionFor(graph: Graph, sources: Sources, calleeId: string, seed: string) {
  const symbol = graph.symbols.find((s) => s.id === calleeId);
  if (!symbol || (symbol.kind !== "function" && symbol.kind !== "method")) return null;
  const source = sourceFor(graph, sources, symbol);
  if (!source) return null;
  const made = await built(graph, symbol, source);
  if (!made) return null;
  const { b, constants } = made;
  const keep = [
    ...b.body.cells.filter((c) => c.kind === "heart"),
    ...b.body.cells.filter((c) => c.kind !== "heart"),
  ].slice(0, 5);
  const ids = new Set(keep.map((c) => c.id));
  const prefix = `m${calleeId.slice(0, 6)}-`;
  const rename = (id: string) => `${prefix}${id}`;
  const cells = b.body.cells
    .filter((c) => ids.has(c.id))
    .map((c) => {
      const { limbId: _limb, calleeId: _callee, calleeName: _name, ...rest } = c;
      return {
        ...rest,
        id: rename(c.id),
        guardJointIds: c.guardJointIds?.filter((g) => ids.has(g)).map(rename),
        guardArmorIds: c.guardArmorIds?.filter((g) => ids.has(g)).map(rename),
      };
    });
  if (!cells.some((c) => c.kind === "heart")) return null;
  const ctx: PuzzleContext = { built: b, graph, constants, seed };
  const questions = cellQuestions(ctx, candidateInputs(b, constants))
    .filter((q) => q.cellId && ids.has(q.cellId) && q.action !== "trace")
    .map((q) => ({ ...q, id: `${prefix}${q.id}`, cellId: q.cellId ? rename(q.cellId) : undefined }));
  const body: CodeBody = { ...b.body, id: `minion-${calleeId}`, cells, limbs: [], inputs: [] };
  return { body: { ...body, spriteFrame: 122 }, questions };
}
const near = (world: WorldModel, at: WorldPosition, taken: Set<string>): WorldPosition => {
  const map = world.maps.find((m) => m.id === at.mapId);
  if (!map) return at;
  for (let r = 1; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = at.x + dx,
          y = at.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        if (map.collision[y * map.width + x] === 0 && !taken.has(`${map.id}:${x}:${y}`)) return { mapId: map.id, x, y };
      }
  return at;
};
export interface EncounterIndexEntry {
  id: string;
  kind: MonsterKind | "golem" | "titan" | "ouroboros";
  name: string;
  level: number;
  smellId: string | null;
  symbolId: string | null;
  regionId: string;
  position: WorldPosition;
  fightable: boolean;
  reason: string | null;
}
/**
 * Builds the encounter for one monster: its body (or two, for a Mimic), inputs,
 * ground-truth questions for every cell, the twist, minions, hints and the
 * Bestiary record. Null when no body can be built (the index says why).
 */
export async function buildEncounter(
  graph: Graph,
  sources: Sources,
  monster: { id: string; kind: MonsterKind; level: number; smell: Smell | null; symbolId: string; mutation?: boolean },
  seed: string,
): Promise<{ encounter: Encounter; mutation: Mutation | null } | null> {
  const symbol = graph.symbols.find((s) => s.id === monster.symbolId);
  if (!symbol) return null;
  const source = sourceFor(graph, sources, symbol);
  if (!source) return null;
  const made = await built(graph, symbol, source);
  if (!made) return null;
  const { b, constants } = made;
  b.body.inputs = inputsFor(graph, b, constants);
  const ctx: PuzzleContext = { built: b, graph, constants, seed };
  const candidates = candidateInputs(b, constants);
  const questions = cellQuestions(ctx, candidates);
  const profile = PROFILE[monster.kind];
  const bodies: CodeBody[] = [b.body];
  let mutation: Mutation | null = null;
  const smell = monster.smell;
  const evidenceLine = smell?.range.startLine ?? symbol.range.startLine;
  // Twists (MASTER-PLAN §8).
  switch (monster.kind) {
    case "gremlin": {
      const todoLine = source.lines[evidenceLine - 1]?.trim() ?? "TODO";
      const cell = b.body.cells.find((c) => c.lines[0] >= evidenceLine) ?? b.body.cells[0];
      if (cell) {
        cell.todo = todoLine.replace(/^(?:\/\/|#|\/\*+|\*)\s*/, "");
        questions.push(
          opinion(
            "classify-todo",
            "classify-todo",
            "classify",
            `How would you classify this note? \`${cell.todo}\``,
            ["A bug to fix", "A missing feature", "A clean-up", "A performance issue"],
            `${source.path}:${evidenceLine}`,
            "There is no single right answer: notes like this are known debt. Writing it down as an issue is the real fix.",
            [symbol.id],
            cell.id,
          ),
        );
      }
      break;
    }
    case "mimic": {
      const twinId = smell?.symbolIds.find((id) => id !== symbol.id);
      const twin = twinId ? graph.symbols.find((s) => s.id === twinId) : undefined;
      const twinSource = twin ? sourceFor(graph, sources, twin) : null;
      const other = twin && twinSource ? await built(graph, twin, twinSource) : null;
      if (other) {
        other.b.body.inputs = [];
        for (const cell of b.body.cells) {
          const mate = other.b.body.cells.find((c) => c.row === cell.row && c.col === cell.col);
          const norm = (t: string) => t.replace(/\s+/g, " ");
          if (mate && norm(mate.label) !== norm(cell.label) && mate.kind === cell.kind) {
            cell.twinDiff = true;
            mate.twinDiff = true;
          }
        }
        const twinBody = {
          ...other.b.body,
          id: `${other.b.body.id}-twin`,
          cells: other.b.body.cells.map((c) => ({
            ...c,
            id: `t${c.id}`,
            limbId: c.limbId ? `t${c.limbId}` : undefined,
            guardJointIds: c.guardJointIds?.map((g) => `t${g}`),
            guardArmorIds: c.guardArmorIds?.map((g) => `t${g}`),
          })),
          limbs: other.b.body.limbs.map((l) => ({
            id: `t${l.id}`,
            jointId: `t${l.jointId}`,
            cellIds: l.cellIds.map((x) => `t${x}`),
          })),
        };
        bodies.push(twinBody);
        const diff = b.body.cells.find((c) => c.twinDiff);
        const q = diff ? compareTwins(ctx, { built: other.b, graph, constants: other.constants, seed }, diff.id) : null;
        if (q) questions.push(q);
      }
      break;
    }
    case "mutant": {
      mutation = await mutate(b, source.text, source.language);
      if (!mutation) return null;
      const cell = b.body.cells.find((c) => c.id === mutation?.cellId);
      if (cell) {
        cell.corrupted = true;
        cell.label = mutation.mutated
          .trim()
          .replace(/;$/, "")
          .replace(/\s*\{$/, "");
        const offset = mutation.line - b.body.code.startLine;
        b.body.code.lines[offset] = mutation.mutated;
      }
      const q = mutantHunt(ctx, mutation);
      if (q) questions.push(q);
      break;
    }
    case "ghost": {
      const q = whoCalls(ctx, "prove");
      if (q) questions.push(q);
      break;
    }
    case "wisp":
      questions.push(
        opinion(
          "investigate",
          "investigate",
          "investigate",
          `No call reaches \`${symbol.name}\` statically, but ${smell?.evidence.message ?? "dynamic calls may"}. What do you report?`,
          ["Dead: safe to delete", "Used dynamically (by name or config)", "Not sure: needs a closer look"],
          `${source.path}:${symbol.range.startLine}`,
          "The analyzer cannot prove this either way. Your note goes into the Bestiary.",
          [symbol.id],
        ),
      );
      break;
    case "minotaur": {
      const q = maze(ctx);
      if (q) questions.push(q);
      break;
    }
    case "imp": {
      const line = source.lines[evidenceLine - 1] ?? "";
      const literal = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/.exec(line.replace(/\/\/.*$/, ""))?.[0] ?? "the literal";
      const cell =
        b.body.cells.find((c) => c.lines[0] <= evidenceLine && evidenceLine <= c.lines[1]) ?? b.body.cells[0];
      if (cell) {
        cell.sparkle = literal;
        questions.push(
          opinion(
            "name-constant",
            "name-constant",
            "name",
            `What would you name \`${literal}\`?`,
            ["A constant named after its meaning", "Leave it as it is", "A comment next to it"],
            `${source.path}:${evidenceLine}`,
            "Naming is a judgment call: a named constant explains why the value is what it is.",
            [symbol.id],
            cell.id,
          ),
        );
      }
      break;
    }
    case "wraith":
      for (const c of b.body.cells) if (c.kind === "armor") c.hp = 3;
      break;
    case "shapeshifter": {
      const param = b.body.params.find((p) =>
        symbol.parameters.find((x) => x.name === p && (!x.type || x.type === "any")),
      );
      const q = param ? fieldSense(ctx, param) : null;
      if (q) questions.push(q);
      break;
    }
    case "echo":
      for (const p of b.body.params) {
        const q = echo(ctx, p);
        if (q) questions.push(q);
        if (questions.filter((x) => x.type === "echo").length >= 3) break;
      }
      break;
    case "shadow": {
      for (const c of b.body.cells) c.dark = true;
      // Light the untested branch: an input that makes its condition true (safe evaluator).
      for (const joint of b.body.cells.filter((c) => c.kind === "joint")) {
        const q = pathFinder(ctx, joint.id, [...b.body.inputs.map((i) => i.args), ...candidates], "reach");
        if (q) {
          questions.push({
            ...q,
            id: `reach-${joint.id}`,
            prompt: `No test references this function. Practice a branch condition: ${q.prompt}`,
          });
          break;
        }
      }
      break;
    }
    default:
      break;
  }
  // Minions: organs whose callee has a body (at most two per fight).
  const minions: Encounter["minions"] = [];
  for (const organ of b.body.cells.filter((c) => c.kind === "organ" && c.calleeId)) {
    if (minions.length >= 2 || !organ.calleeId) break;
    const m = await minionFor(graph, sources, organ.calleeId, seed);
    if (!m) continue;
    if (minions.some((existing) => existing.id === m.body.id)) {
      organ.minionId = m.body.id;
      continue;
    }
    organ.minionId = m.body.id;
    minions.push(m.body);
    questions.push(...m.questions);
  }
  const hearts = b.body.cells.filter((c) => c.kind === "heart").length;
  const phases =
    monster.kind === "serpent" && hearts >= 2
      ? [
          {
            name: "Phase 2: the Serpent sheds its skin",
            heartsLeft: Math.floor(hearts / 2),
            telegraph: "Cells you read are hidden again, and its strikes hurt more.",
            rehide: true,
            wrongPredictionBonus: 1,
          },
        ]
      : [];
  const kindKey = smell?.kind ?? "injected-mutation";
  const encounter = EncounterSchema.parse({
    version: 1,
    id: monster.id,
    smellId: smell?.id ?? null,
    kind: monster.kind,
    name: `${profile.name} of ${symbol.name}`,
    species: profile.name,
    level: monster.level,
    spriteFrame: profile.frame,
    intro: `Its body is \`${symbol.name}\` from ${source.path}. Each row is a statement; each step right is one level of nesting.`,
    twist: {
      kind: profile.twist,
      text: profile.twistText,
      actions: [
        ...new Set(
          questions
            .filter((q) =>
              [
                "compare",
                "hunt",
                "prove",
                "investigate",
                "classify",
                "name",
                "match",
                "maze",
                "shape",
                "reach",
              ].includes(q.action),
            )
            .map((q) => q.action),
        ),
      ],
    },
    bodies,
    minions,
    questions,
    hints: hintsFor(ctx, questions),
    phases,
    smellAttack: {
      name: profile.attack[0],
      text: profile.attack[1],
      focusDamage: Math.min(3, 1 + Math.floor((monster.level - 1) / 2)),
    },
    bestiary: {
      smellKind: kindKey,
      title: `${profile.name}: ${smell?.evidence.message ?? "an injected bug for Mutant Hunt"}`,
      path: source.path,
      lines: [smell?.range.startLine ?? symbol.range.startLine, smell?.range.endLine ?? symbol.range.endLine],
      message:
        smell?.evidence.message ??
        `One line of \`${symbol.name}\` was mutated on purpose: ${mutation?.description ?? ""}.`,
      measured: smell?.evidence.measured ?? null,
      threshold: smell?.evidence.threshold ?? null,
      fix: FIX[kindKey] ?? "Refactor with care and add tests.",
      teaches: profile.teaches,
    },
  });
  return { encounter, mutation };
}
/**
 * Every monster in the world plus one Mutant per region (on the function with
 * the most test assertions, when a mutation applies). Mini-bosses wait for Phase 09.
 */
export async function buildEncounters(world: WorldModel, graph: Graph, sources: Sources) {
  const index: EncounterIndexEntry[] = [];
  const encounters = new Map<string, Encounter>();
  const taken = new Set<string>();
  for (const m of world.monsters) taken.add(`${m.position.mapId}:${m.position.x}:${m.position.y}`);
  const smells = new Map(graph.smells.map((s) => [s.id, s]));
  for (const m of [...world.monsters].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const smell = smells.get(m.smellId) ?? null;
    const kind = KIND_OF[m.kind] ?? "shadow";
    const symbolId =
      smell?.symbolIds.find((id) => {
        const s = graph.symbols.find((x) => x.id === id);
        return s && (s.kind === "function" || s.kind === "method" || s.kind === "class");
      }) ?? null;
    const entry: EncounterIndexEntry = {
      id: m.id,
      kind,
      name: kind,
      level: m.level,
      smellId: m.smellId,
      symbolId,
      regionId: m.regionId,
      position: m.position,
      fightable: false,
      reason: null,
    };
    if (kind === "golem" || kind === "titan" || kind === "ouroboros")
      entry.reason = "A mini-boss: its special fight arrives in Phase 09.";
    else if (!symbolId) entry.reason = "This smell has no function body to fight.";
    else {
      const built = await buildEncounter(
        graph,
        sources,
        { id: m.id, kind, level: m.level, smell, symbolId },
        world.seed,
      ).catch(() => null);
      if (built) {
        encounters.set(m.id, built.encounter);
        entry.fightable = true;
        entry.name = built.encounter.name;
      } else entry.reason = "Its body could not be built from the syntax tree.";
    }
    index.push(entry);
  }
  // Mutants: one per region, on the most-tested function.
  const buildingOf = (fileId: string) => world.buildings.find((b) => b.fileIds.includes(fileId));
  const tested = new Map<string, number>();
  for (const t of graph.testFacts) tested.set(t.calleeSymbolId, (tested.get(t.calleeSymbolId) ?? 0) + 1);
  const byRegion = new Map<string, SymbolNode[]>();
  for (const s of graph.symbols) {
    if (!tested.has(s.id) || (s.kind !== "function" && s.kind !== "method")) continue;
    const b = buildingOf(s.fileId);
    if (!b) continue;
    byRegion.set(b.regionId, [...(byRegion.get(b.regionId) ?? []), s]);
  }
  for (const [regionId, list] of [...byRegion].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const ranked = list.sort((a, b) => (tested.get(b.id) ?? 0) - (tested.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));
    for (const s of ranked) {
      const building = buildingOf(s.fileId);
      if (!building) continue;
      const id = `mutant-${s.id}`;
      const built = await buildEncounter(
        graph,
        sources,
        { id, kind: "mutant", level: 1 + Math.min(4, tested.get(s.id) ?? 0), smell: null, symbolId: s.id },
        world.seed,
      ).catch(() => null);
      if (!built?.mutation || !built.encounter.questions.some((q) => q.type === "mutant-hunt")) continue;
      const position = near(world, building.door, taken);
      taken.add(`${position.mapId}:${position.x}:${position.y}`);
      encounters.set(id, built.encounter);
      index.push({
        id,
        kind: "mutant",
        name: built.encounter.name,
        level: built.encounter.level,
        smellId: null,
        symbolId: s.id,
        regionId,
        position,
        fightable: true,
        reason: null,
      });
      break;
    }
  }
  return { index, encounters };
}
