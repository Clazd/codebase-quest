import type { BodyInput, Cell, CodeBody, Encounter, Question, QuestionAction } from "./schema.ts";

/**
 * Code-Body Combat rules (MASTER-PLAN §7.3–§7.4), ported from the Phase 01
 * prototype (ADR 0003) and generalized for generated bodies, twists and minions.
 * Pure: every move takes a state and returns a new one. The answer key stays
 * inside this module; public views (`publicView`) never include it.
 */
export interface Balance {
  energyPerTurn: number;
  costs: Record<string, number>;
  difficulties: Record<
    Difficulty,
    { focus: number; wrongPrediction: number; startRevealed: boolean; showKindIcons: boolean }
  >;
  traceDamage: number;
  counterDamage: number;
  organSummonAfterTurns: number;
  minionDamage: number;
  wrongAnswerFocusPenalty: number;
  fleeMemorySeconds: number;
  tokenStepMs: number;
  potions?: Record<Difficulty, number>;
}
export type Difficulty = "story" | "normal" | "expert";
export type PlayerAction = "read" | "gitling" | "potion" | "tonic" | "smoke" | "recall" | "flee" | QuestionAction;
export const ACTION_COSTS: Record<string, number> = {
  compare: 3,
  hunt: 3,
  prove: 3,
  investigate: 0,
  classify: 1,
  name: 1,
  match: 2,
  maze: 4,
  shape: 3,
  potion: 0,
  tonic: 0,
  smoke: 0,
  recall: 0,
};
export interface CellState {
  hp: number;
  destroyed: boolean;
  revealed: boolean;
  /** Hearts: a trace or counter-attack passed through it. */
  traced: boolean;
}
export type Pending =
  | { kind: "question"; questionId: string; action: PlayerAction; cellId: string | null; removed: number[] }
  | { kind: "prediction"; inputId: string };
export interface LogEntry {
  tone: "info" | "good" | "bad" | "monster";
  text: string;
}
export interface Execution {
  inputId: string;
  pathCellIds: string[];
  exitHeartId: string;
  predictedHeartId: string;
  correct: boolean;
}
export type Outcome = "victory" | "defeat" | "fled" | "tamed";
export interface CombatState {
  encounter: Encounter;
  balance: Balance;
  difficulty: Difficulty;
  focus: number;
  maxFocus: number;
  energy: number;
  turn: number;
  cells: Record<string, CellState>;
  summoned: string[];
  organIgnored: Record<string, number>;
  phase: number;
  twistResolved: boolean;
  /** Twist questions answered correctly (Echo needs several). */
  twistAnswered: string[];
  /** Mutant: cells the (visual) corruption has spread to. */
  spread: string[];
  inputCursor: number;
  pending: Pending | null;
  lastExecution: Execution | null;
  log: LogEntry[];
  outcome: Outcome | null;
  potions: number;
  items: { tonics: number; smokeBombs: number; recallScrolls: number };
  recalled: boolean;
  xp: number;
  /** Hint ladder rung used per cell. */
  ladder: Record<string, number>;
  /** Symbols whose scored questions were answered correctly. */
  understood: string[];
  /** Opinion answers (XP only), by question. */
  opinions: Record<string, string>;
  stats: {
    reads: number;
    hints: number;
    answersRight: number;
    answersWrong: number;
    predictionsRight: number;
    predictionsWrong: number;
  };
}
export interface CellInfo {
  cell: Cell;
  body: CodeBody;
  minion: boolean;
}
export function cellIndex(e: Encounter): Map<string, CellInfo> {
  const map = new Map<string, CellInfo>();
  for (const body of e.bodies) for (const cell of body.cells) map.set(cell.id, { cell, body, minion: false });
  for (const body of e.minions) for (const cell of body.cells) map.set(cell.id, { cell, body, minion: true });
  return map;
}
const indexCache = new WeakMap<Encounter, Map<string, CellInfo>>();
function info(state: CombatState, cellId: string): CellInfo {
  let index = indexCache.get(state.encounter);
  if (!index) {
    index = cellIndex(state.encounter);
    indexCache.set(state.encounter, index);
  }
  const found = index.get(cellId);
  if (!found) throw new Error(`Unknown cell "${cellId}"`);
  return found;
}
function cs(state: CombatState, cellId: string): CellState {
  const c = state.cells[cellId];
  if (!c) throw new Error(`Unknown cell "${cellId}"`);
  return c;
}
const inputs = (e: Encounter): BodyInput[] => e.bodies.flatMap((b) => b.inputs);
export function inputById(e: Encounter, id: string): BodyInput {
  const found = inputs(e).find((i) => i.id === id);
  if (!found) throw new Error(`Unknown input "${id}"`);
  return found;
}
export function questionById(e: Encounter, id: string): Question {
  const q = e.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question "${id}"`);
  return q;
}
/** Hearts that decide victory (a Mimic's twin mirrors its original). */
export function mainHearts(e: Encounter): Cell[] {
  return (e.kind === "mimic" ? e.bodies.slice(0, 1) : e.bodies).flatMap((b) =>
    b.cells.filter((c) => c.kind === "heart"),
  );
}
export function heartsAlive(state: CombatState): string[] {
  return mainHearts(state.encounter)
    .filter((h) => !cs(state, h.id).destroyed)
    .map((h) => h.id);
}
/** Monster HP: the remaining HP of every main-body cell. */
export function monsterHp(state: CombatState): { hp: number; max: number } {
  let hp = 0,
    max = 0;
  for (const b of state.encounter.bodies)
    for (const c of b.cells) {
      max += c.hp;
      hp += cs(state, c.id).destroyed ? 0 : cs(state, c.id).hp;
    }
  return { hp, max };
}
export function isActive(state: CombatState, cellId: string): boolean {
  const i = info(state, cellId);
  return !i.minion || state.summoned.includes(i.body.id);
}
/** Whole-body traces exist (paths, call order): then unguarded hearts must be traced before piercing. */
const traceable = (e: Encounter) => e.questions.some((q) => q.action === "trace" && q.type !== "fill-gap");
/**
 * A heart is exposed when traced, or when every joint guarding it is destroyed.
 * An unguarded heart is exposed from the start only when its body offers no trace.
 */
export function isExposed(state: CombatState, heartId: string): boolean {
  const { cell, minion } = info(state, heartId);
  if (cell.kind !== "heart") return false;
  if (cs(state, heartId).traced) return true;
  const guards = cell.guardJointIds ?? [];
  if (guards.length) return guards.every((g) => cs(state, g).destroyed);
  return minion || !traceable(state.encounter);
}
export function currentPhase(state: CombatState) {
  return state.phase === 0 ? undefined : state.encounter.phases[state.phase - 1];
}
const TWIST_ACTIONS = new Set([
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
]);
/** The question an action on a target asks (twist actions may ignore the target). */
export function questionFor(state: CombatState, action: PlayerAction, cellId: string | null): Question | undefined {
  const qs = state.encounter.questions;
  if (action === "trace") {
    const viaInput = cellId
      ? qs.find((q) => q.action === "trace" && q.type === "path" && q.cellId === cellId)
      : undefined;
    const whole = qs.find(
      (q) => q.action === "trace" && (q.type === "order-steps" || q.type === "trace" || q.type === "who-calls"),
    );
    const line = cellId
      ? qs.find((q) => q.action === "trace" && q.type === "fill-gap" && q.cellId === cellId)
      : undefined;
    return viaInput ?? (cellId && info(state, cellId).cell.kind !== "heart" ? line : undefined) ?? whole;
  }
  if (TWIST_ACTIONS.has(action))
    return qs.find((q) => q.action === action && !state.twistAnswered.includes(q.id) && !state.opinions[q.id]);
  return qs.find((q) => q.action === action && q.cellId === cellId);
}
export function costOf(state: CombatState, action: PlayerAction): number {
  return state.balance.costs[action] ?? ACTION_COSTS[action] ?? 3;
}
export function createCombat(encounter: Encounter, balance: Balance, difficulty: Difficulty): CombatState {
  const rules = balance.difficulties[difficulty];
  const cells: Record<string, CellState> = {};
  for (const { cell } of cellIndex(encounter).values())
    cells[cell.id] = { hp: cell.hp, destroyed: false, revealed: rules.startRevealed, traced: false };
  return {
    encounter,
    balance,
    difficulty,
    focus: rules.focus,
    maxFocus: rules.focus,
    energy: balance.energyPerTurn,
    turn: 1,
    cells,
    summoned: [],
    organIgnored: {},
    phase: 0,
    twistResolved: encounter.twist.actions.length === 0,
    twistAnswered: [],
    spread: [],
    inputCursor: 0,
    pending: null,
    lastExecution: null,
    log: [
      { tone: "info", text: encounter.intro },
      ...(encounter.twist.kind !== "none" ? [{ tone: "monster" as const, text: encounter.twist.text }] : []),
    ],
    outcome: null,
    potions: balance.potions?.[difficulty] ?? { story: 3, normal: 2, expert: 1 }[difficulty],
    items: { tonics: 1, smokeBombs: 1, recallScrolls: 1 },
    recalled: false,
    xp: 0,
    ladder: {},
    understood: [],
    opinions: {},
    stats: { reads: 0, hints: 0, answersRight: 0, answersWrong: 0, predictionsRight: 0, predictionsWrong: 0 },
  };
}
function draft(state: CombatState): CombatState {
  const { encounter, balance, ...rest } = state;
  return { ...structuredClone(rest), encounter, balance };
}
export interface ActionCheck {
  ok: boolean;
  cost: number;
  reason?: string;
}
const KIND_NAME: Record<string, string> = {
  sever: "Only joints (◆) can be severed.",
  disable: "Only organs (⚙) can be disabled.",
  armor: "Only armor (⬟) can be broken.",
  pierce: "Only hearts (♥) can be pierced.",
};
const KIND_FOR: Record<string, Cell["kind"]> = { sever: "joint", disable: "organ", armor: "armor", pierce: "heart" };
export function checkAction(state: CombatState, action: PlayerAction, cellId: string | null): ActionCheck {
  const cost = costOf(state, action);
  const no = (reason: string): ActionCheck => ({ ok: false, cost, reason });
  if (state.outcome) return no("The fight is over.");
  if (action === "smoke") return state.items.smokeBombs > 0 ? { ok: true, cost: 0 } : no("No Smoke Bombs left.");
  if (action === "recall")
    return state.items.recallScrolls > 0 ? { ok: true, cost: 0 } : no("No Scrolls of Recall left.");
  if (action === "tonic" && !state.pending)
    return state.items.tonics > 0 ? { ok: true, cost: 0 } : no("No Energy Tonics left.");
  if (action === "potion") {
    if (state.potions < 1) return no("No Hint Potions left.");
    if (state.pending?.kind === "question") {
      const q = questionById(state.encounter, state.pending.questionId);
      if (q.answer === null || q.choices.length - state.pending.removed.length <= 2)
        return no("Nothing left to remove.");
      return { ok: true, cost };
    }
    if (state.pending) return no("Predict the exit first.");
    if (!cellId || cs(state, cellId).revealed) return no("Select a hidden cell to reveal.");
    return { ok: true, cost };
  }
  if (state.pending)
    return no(state.pending.kind === "question" ? "Answer the current question first." : "Predict the exit first.");
  if (action === "flee") return { ok: true, cost };
  if (state.energy < cost) return no(`Not enough Energy (needs ${cost}).`);
  if (TWIST_ACTIONS.has(action)) {
    if (state.twistResolved && !["investigate"].includes(action)) return no("The twist is already resolved.");
    return questionFor(state, action, cellId) ? { ok: true, cost } : no("This monster has no such twist.");
  }
  if (action === "trace" && !cellId)
    return questionFor(state, action, null) ? { ok: true, cost } : no("Nothing to trace.");
  if (!cellId) return no("Select a cell first.");
  if (!isActive(state, cellId)) return no("That minion hasn't been summoned.");
  const { cell } = info(state, cellId);
  const c = cs(state, cellId);
  if (c.destroyed) return no("That cell is already destroyed.");
  if (action === "read") return c.revealed ? no("Already revealed.") : { ok: true, cost };
  if (action === "gitling") {
    const rung = state.ladder[cellId] ?? 0;
    if (!state.encounter.hints[cellId]) return no("Gitling has nothing to say about this cell.");
    if (rung >= 3) return no("Gitling has told you everything about this cell.");
    if (rung === 2 && state.potions < 1) return no("The explanation costs a Hint Potion.");
    return { ok: true, cost };
  }
  const kind = KIND_FOR[action];
  if (!["read", "gitling", "armor"].includes(action) && cell.guardArmorIds?.some((id) => !cs(state, id).destroyed))
    return no("Break the protecting armor first.");
  if (kind && cell.kind !== kind) return no(KIND_NAME[action] ?? "Wrong target.");
  if (action === "pierce" && !isExposed(state, cellId))
    return no("This heart isn't exposed. Sever its guards or trace a path through it.");
  if (action === "trace" && cell.kind !== "heart" && !questionFor(state, action, cellId)?.cellId)
    return no("Trace towards a heart (♥), or trace an ordinary line.");
  return questionFor(state, action, cellId) ? { ok: true, cost } : no("No question for this cell.");
}
/** Performs an action. Actions with a question leave it pending. */
export function act(state: CombatState, action: PlayerAction, cellId: string | null): CombatState {
  const check = checkAction(state, action, cellId);
  if (!check.ok) throw new Error(check.reason);
  const next = draft(state);
  next.energy -= check.cost;
  next.lastExecution = null;
  if (action === "tonic") {
    next.items.tonics--;
    next.energy += 3;
    next.log.push({ tone: "info", text: "Energy Tonic: +3 Energy this turn." });
    return next;
  }
  if (action === "recall") {
    next.items.recallScrolls--;
    next.recalled = true;
    return next;
  }
  if (action === "smoke") {
    next.items.smokeBombs--;
    next.pending = null;
    next.outcome = "fled";
    return next;
  }
  if (action === "flee") {
    next.outcome = "fled";
    next.log.push({ tone: "info", text: "You slip away. The monster keeps its wounds for a while." });
    return next;
  }
  if (action === "potion") {
    next.potions -= 1;
    const open = next.pending;
    if (open?.kind === "question") {
      const q = questionById(next.encounter, open.questionId);
      const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.answer && !open.removed.includes(i));
      open.removed.push(...wrong.slice(0, 2));
      next.log.push({ tone: "info", text: "The Hint Potion fizzles: two wrong choices vanish." });
    } else if (cellId) {
      cs(next, cellId).revealed = true;
      next.log.push({ tone: "info", text: `The Hint Potion reveals line ${info(next, cellId).cell.lines[0]}.` });
    }
    return next;
  }
  const id = cellId;
  if (action === "read" && id) {
    cs(next, id).revealed = true;
    next.stats.reads += 1;
    const { cell } = info(next, id);
    next.log.push({ tone: "info", text: `You read line ${cell.lines[0]}: ${cell.label}` });
    return next;
  }
  if (action === "gitling" && id) {
    const rung = next.ladder[id] ?? 0;
    const hint = next.encounter.hints[id];
    if (!hint) return next;
    next.stats.hints += 1;
    next.ladder[id] = rung + 1;
    if (rung === 2) next.potions -= 1;
    const text = rung === 0 ? hint.nudge : rung === 1 ? hint.pointer.text : hint.explanation;
    if (rung === 1) cs(next, id).revealed = true;
    next.log.push({ tone: "info", text: `Gitling: “${text}”` });
    return next;
  }
  const question = questionFor(next, action, id) as Question;
  next.pending = { kind: "question", questionId: question.id, action, cellId: id, removed: [] };
  return next;
}
function destroy(state: CombatState, cellId: string) {
  const c = cs(state, cellId);
  c.destroyed = true;
  c.revealed = true;
  c.hp = 0;
  // Mimic twins mirror each other.
  const twin = state.cells[`t${cellId}`];
  if (state.encounter.kind === "mimic" && twin && !twin.destroyed) destroy(state, `t${cellId}`);
}
function exposeAll(state: CombatState) {
  for (const h of mainHearts(state.encounter)) cs(state, h.id).traced = true;
}
/** Damages body and organ cells on a path, reveals it, and exposes its hearts. */
function strikePath(state: CombatState, path: readonly string[], damage: number) {
  for (const id of path) {
    const c = cs(state, id);
    if (c.destroyed) continue;
    c.revealed = true;
    const { kind } = info(state, id).cell;
    if (info(state, id).cell.guardArmorIds?.some((guard) => !cs(state, guard).destroyed)) continue;
    if (kind === "heart") c.traced = true;
    else if (kind === "body" || kind === "organ") {
      c.hp = Math.max(0, c.hp - damage);
      if (c.hp === 0) destroy(state, id);
    }
  }
}
/** Answers the pending question with a choice index. */
export function answer(state: CombatState, choice: number): CombatState {
  const pending = state.pending;
  if (pending?.kind !== "question") throw new Error("No question to answer.");
  const q = questionById(state.encounter, pending.questionId);
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) throw new Error("No such choice.");
  if (pending.removed.includes(choice)) throw new Error("That choice was removed.");
  const next = draft(state);
  next.pending = null;
  if (q.answer === null) {
    next.xp += 2;
    // Opinion: XP only, never `understood`.
    next.opinions[q.id] = q.choices[choice] ?? "";
    next.log.push({ tone: "good", text: q.explanation });
    if (q.action === "investigate") {
      next.outcome = "tamed";
      next.log.push({ tone: "good", text: "Your report is noted in the Bestiary. The Wisp drifts away, calm." });
      return next;
    }
    next.twistResolved = true;
    next.log.push({ tone: "good", text: "The monster calms down: its smell attack stops." });
    return settle(next);
  }
  if (choice !== q.answer) {
    next.stats.answersWrong += 1;
    next.focus -= next.balance.wrongAnswerFocusPenalty;
    next.log.push({ tone: "bad", text: "Not quite. The monster shrugs it off." });
    return settle(next);
  }
  next.stats.answersRight += 1;
  next.xp += 5;
  for (const s of q.symbolIds) if (!next.understood.includes(s)) next.understood.push(s);
  next.log.push({ tone: "good", text: q.explanation });
  const cellId = TWIST_ACTIONS.has(q.action) ? (q.cellId ?? null) : (pending.cellId ?? q.cellId ?? null);
  switch (q.action) {
    case "sever": {
      if (!cellId) break;
      destroy(next, cellId);
      const { body } = info(next, cellId);
      const limb = body.limbs.find((l) => l.jointId === cellId);
      for (const id of limb?.cellIds ?? []) destroy(next, id);
      next.log.push({
        tone: "good",
        text: `Severed! The whole limb (${(limb?.cellIds.length ?? 0) + 1} cells) falls.`,
      });
      break;
    }
    case "pierce":
    case "disable":
    case "armor":
      if (cellId) destroy(next, cellId);
      next.log.push({
        tone: "good",
        text:
          q.action === "pierce"
            ? "Heart pierced!"
            : q.action === "disable"
              ? "Organ disabled. It won't summon anything now."
              : "Armor broken!",
      });
      break;
    case "trace": {
      if (q.inputId) {
        strikePath(next, inputById(next.encounter, q.inputId).pathCellIds, next.balance.traceDamage);
        next.log.push({ tone: "good", text: "Trace Strike! The path lights up and its heart is exposed." });
      } else if (q.type === "fill-gap" && q.cellId) {
        destroy(next, q.cellId);
        next.log.push({ tone: "good", text: "Trace Strike! You read that line right: it falls." });
      } else {
        const main = next.encounter.bodies[0]?.cells ?? [];
        strikePath(
          next,
          main.filter((c) => c.kind === "body" || c.kind === "organ").map((c) => c.id),
          next.balance.traceDamage,
        );
        for (const h of main.filter((c) => c.kind === "heart" && !(c.guardJointIds ?? []).length))
          cs(next, h.id).traced = true;
        next.log.push({
          tone: "good",
          text: "Trace Strike! You follow the steps: every statement is wounded and open exits are exposed.",
        });
      }
      break;
    }
    case "compare":
      for (const b of next.encounter.bodies) for (const c of b.cells) if (c.twinDiff) destroy(next, c.id);
      exposeAll(next);
      next.twistResolved = true;
      next.log.push({ tone: "good", text: "You found the difference! Both twins' hearts are exposed." });
      break;
    case "hunt":
      // The corrupted line falls; a corrupted heart is only exposed (its return still has to be predicted).
      if (cellId && info(next, cellId).cell.kind !== "heart") destroy(next, cellId);
      for (const id of next.spread) cs(next, id).revealed = true;
      exposeAll(next);
      next.twistResolved = true;
      next.log.push({ tone: "good", text: "You caught the corrupted line! The Mutant's hearts are exposed." });
      break;
    case "prove":
      next.twistResolved = true;
      for (const b of next.encounter.bodies) for (const c of b.cells) destroy(next, c.id);
      next.log.push({ tone: "good", text: "Nobody calls it. With no tether left, the Ghost fades." });
      break;
    case "maze": {
      const deepest = cellId;
      if (deepest) {
        const { body } = info(next, deepest);
        for (const l of body.limbs.filter((x) => x.cellIds.includes(deepest))) destroy(next, l.jointId);
        destroy(next, deepest);
      }
      exposeAll(next);
      next.twistResolved = true;
      next.log.push({ tone: "good", text: "You walked the maze to its center. Its walls collapse." });
      break;
    }
    case "reach":
      for (const b of next.encounter.bodies) for (const c of b.cells) cs(next, c.id).revealed = true;
      exposeAll(next);
      next.twistResolved = true;
      next.log.push({
        tone: "good",
        text: "Your input lights up the untested branch. The Shadow has nowhere to hide.",
      });
      break;
    case "shape":
      exposeAll(next);
      next.twistResolved = true;
      next.log.push({ tone: "good", text: "You named its real shape. The Shapeshifter is pinned down." });
      break;
    case "match": {
      next.twistAnswered.push(q.id);
      const all = next.encounter.questions.filter((x) => x.action === "match");
      if (all.every((x) => next.twistAnswered.includes(x.id))) {
        next.twistResolved = true;
        exposeAll(next);
        next.log.push({ tone: "good", text: "Every voice matched. The Echo falls silent." });
      } else next.log.push({ tone: "good", text: "One voice quiets down." });
      break;
    }
    default:
      break;
  }
  return settle(next);
}
function settle(state: CombatState): CombatState {
  const alive = heartsAlive(state).length;
  const nextPhase = state.encounter.phases[state.phase];
  if (nextPhase && alive > 0 && alive <= nextPhase.heartsLeft) {
    state.phase += 1;
    state.log.push({ tone: "monster", text: `${nextPhase.name}. ${nextPhase.telegraph}` });
    if (nextPhase.rehide)
      for (const b of state.encounter.bodies)
        for (const c of b.cells) if (!cs(state, c.id).destroyed) cs(state, c.id).revealed = false;
  }
  const hasHearts = mainHearts(state.encounter).length > 0;
  if ((hasHearts && alive === 0) || monsterHp(state).hp === 0) {
    state.outcome = "victory";
    state.pending = null;
    state.log.push({ tone: "good", text: `${state.encounter.name} falls! Its body becomes a map in your Codex.` });
  } else if (state.focus <= 0) {
    state.focus = 0;
    state.outcome = "defeat";
    state.pending = null;
    state.log.push({ tone: "bad", text: "Your Focus is gone. You retreat to think it over." });
  }
  return state;
}
const CALMED = new Set(["gremlin", "imp", "shapeshifter", "echo", "mutant", "mimic"]);
/** Ends the player's turn: organs may summon, then the monster runs an input or uses its smell attack. */
export function endTurn(state: CombatState): CombatState {
  if (state.outcome) throw new Error("The fight is over.");
  if (state.pending) throw new Error("Answer the current question first.");
  const next = draft(state);
  next.lastExecution = null;
  for (const b of next.encounter.bodies)
    for (const cell of b.cells) {
      if (!cell.minionId || cs(next, cell.id).destroyed || next.summoned.includes(cell.minionId)) continue;
      const ignored = (next.organIgnored[cell.id] ?? 0) + 1;
      next.organIgnored[cell.id] = ignored;
      if (ignored >= next.balance.organSummonAfterTurns) {
        next.summoned.push(cell.minionId);
        next.log.push({
          tone: "monster",
          text: `The organ on line ${cell.lines[0]} summons ${cell.calleeName ?? "its callee"} as a minion!`,
        });
      }
    }
  if (next.encounter.kind === "mutant" && !next.twistResolved) {
    // The corruption spreads one neighbor per turn (visual only: the answer stays the original line).
    const main = next.encounter.bodies[0]?.cells ?? [];
    const source = [main.find((c) => c.corrupted)?.id, ...next.spread].filter(Boolean) as string[];
    const neighbor = main.find(
      (c) =>
        !source.includes(c.id) && source.some((s) => Math.abs((main.find((x) => x.id === s)?.row ?? 0) - c.row) === 1),
    );
    if (neighbor) next.spread.push(neighbor.id);
  }
  const all = inputs(next.encounter);
  for (let k = 0; k < all.length; k++) {
    const index = (next.inputCursor + k) % all.length;
    const input = all[index] as BodyInput;
    if (!cs(next, input.exitHeartId).destroyed) {
      next.inputCursor = (index + 1) % all.length;
      next.pending = { kind: "prediction", inputId: input.id };
      next.log.push({ tone: "monster", text: `Incoming: ${input.telegraph}! Which heart will it leave through?` });
      return next;
    }
  }
  const attack = next.encounter.smellAttack;
  if (next.twistResolved && CALMED.has(next.encounter.kind))
    next.log.push({ tone: "info", text: "The monster is calm: no smell attack." });
  else {
    next.focus -= attack.focusDamage;
    next.log.push({ tone: "monster", text: `${attack.name}: ${attack.text} (−${attack.focusDamage} Focus)` });
  }
  return finishMonsterTurn(next);
}
/** The free reaction: predict which heart the input leaves through. */
export function predict(state: CombatState, heartId: string): CombatState {
  const pending = state.pending;
  if (pending?.kind !== "prediction") throw new Error("Nothing to predict.");
  const input = inputById(state.encounter, pending.inputId);
  const next = draft(state);
  next.pending = null;
  const correct = heartId === input.exitHeartId;
  next.lastExecution = {
    inputId: input.id,
    pathCellIds: [...input.pathCellIds],
    exitHeartId: input.exitHeartId,
    predictedHeartId: heartId,
    correct,
  };
  if (correct) {
    next.stats.predictionsRight += 1;
    strikePath(next, input.pathCellIds, next.balance.counterDamage);
    next.log.push({ tone: "good", text: "Blocked! You counter-attack along its path." });
  } else {
    const damage =
      next.balance.difficulties[next.difficulty].wrongPrediction + (currentPhase(next)?.wrongPredictionBonus ?? 0);
    next.stats.predictionsWrong += 1;
    next.focus -= damage;
    const exit = info(next, input.exitHeartId).cell;
    next.log.push({ tone: "bad", text: `It left through line ${exit.lines[0]} (${exit.label}). −${damage} Focus.` });
  }
  return finishMonsterTurn(next);
}
function finishMonsterTurn(state: CombatState): CombatState {
  for (const minionId of state.summoned) {
    const minion = state.encounter.minions.find((m) => m.id === minionId);
    const alive = minion?.cells.some((c) => c.kind === "heart" && !cs(state, c.id).destroyed);
    if (minion && alive) {
      state.focus -= state.balance.minionDamage;
      state.log.push({ tone: "monster", text: `Minion ${minion.name} bites! (−${state.balance.minionDamage} Focus)` });
    }
  }
  settle(state);
  if (!state.outcome) {
    state.turn += 1;
    state.energy = state.balance.energyPerTurn;
  }
  return state;
}
export function predictionChoices(state: CombatState): string[] {
  return heartsAlive(state);
}
/** What the UI and debug API may see: no answer indexes, no input exits. */
export function publicView(state: CombatState) {
  const removed = state.pending?.kind === "question" ? state.pending.removed : [];
  const pending = state.pending;
  const q = pending?.kind === "question" ? questionById(state.encounter, pending.questionId) : null;
  return {
    name: state.encounter.name,
    kind: state.encounter.kind,
    bodies: state.encounter.bodies.map((b) => ({
      ...b,
      inputs: b.inputs.map(({ id, args, telegraph, source, evidence }) => ({ id, args, telegraph, source, evidence })),
    })),
    focus: state.focus,
    energy: state.energy,
    monsterHp: monsterHp(state).hp,
    turn: state.turn,
    outcome: state.outcome,
    potions: state.potions,
    cells: state.cells,
    summoned: state.summoned,
    question: q
      ? { id: q.id, type: q.type, action: q.action, prompt: q.prompt, choices: q.choices, removed, scored: q.scored }
      : null,
    prediction: pending?.kind === "prediction" ? { inputId: pending.inputId, choices: predictionChoices(state) } : null,
  };
}
/** Test builds only: the pending question's correct choice (or the exit heart index for a prediction). */
export function testAnswerKey(state: CombatState): number | null {
  const pending = state.pending;
  if (pending?.kind === "question") return questionById(state.encounter, pending.questionId).answer;
  if (pending?.kind === "prediction") {
    const exit = inputById(state.encounter, pending.inputId).exitHeartId;
    return predictionChoices(state).indexOf(exit);
  }
  return null;
}
