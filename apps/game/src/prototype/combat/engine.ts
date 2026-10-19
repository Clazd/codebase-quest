import type { Body, BodyInput, Cell, Monster, Question } from "./schema.ts";

// Code-Body Combat rules (MASTER-PLAN §7.3–§7.4), prototype version.
// Pure functions: every move takes a state and returns a new one, so the UI,
// the tests and a future bot can all drive the same rules.

export interface Balance {
  energyPerTurn: number;
  costs: Record<PlayerAction, number>;
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
}

export type Difficulty = "story" | "normal" | "expert";
export type PlayerAction = "read" | "trace" | "sever" | "disable" | "armor" | "pierce" | "compare" | "gitling" | "flee";
export const ACTIONS: readonly PlayerAction[] = [
  "read",
  "trace",
  "sever",
  "disable",
  "pierce",
  "compare",
  "gitling",
  "flee",
];

export interface CellState {
  hp: number;
  destroyed: boolean;
  revealed: boolean;
  /** Hearts: a trace or counter-attack has passed through it. */
  traced: boolean;
}

export type Pending =
  | { kind: "question"; questionId: string; action: PlayerAction; cellId: string }
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

export interface CombatState {
  monster: Monster;
  balance: Balance;
  difficulty: Difficulty;
  focus: number;
  maxFocus: number;
  energy: number;
  turn: number;
  cells: Record<string, CellState>;
  /** Minion ids in play. */
  summoned: string[];
  /** Organ id → monster turns it has been ignored. */
  organIgnored: Record<string, number>;
  /** 0 = first phase; n = monster.phases[n - 1] is active. */
  phase: number;
  /** Mimic: the difference was found. */
  twistResolved: boolean;
  inputCursor: number;
  pending: Pending | null;
  lastExecution: Execution | null;
  log: LogEntry[];
  outcome: "victory" | "defeat" | "fled" | null;
  stats: {
    reads: number;
    hints: number;
    answersRight: number;
    answersWrong: number;
    predictionsRight: number;
    predictionsWrong: number;
  };
}

// ---------- lookups ----------

export interface CellInfo {
  cell: Cell;
  body: Body;
  minion: boolean;
}

export function cellIndex(monster: Monster): Map<string, CellInfo> {
  const map = new Map<string, CellInfo>();
  for (const body of monster.bodies) for (const cell of body.cells) map.set(cell.id, { cell, body, minion: false });
  for (const body of monster.minions) for (const cell of body.cells) map.set(cell.id, { cell, body, minion: true });
  return map;
}

function info(state: CombatState, cellId: string): CellInfo {
  const found = cellIndex(state.monster).get(cellId);
  if (found === undefined) throw new Error(`Unknown cell "${cellId}"`);
  return found;
}

function cs(state: CombatState, cellId: string): CellState {
  const c = state.cells[cellId];
  if (c === undefined) throw new Error(`Unknown cell "${cellId}"`);
  return c;
}

function allInputs(monster: Monster): BodyInput[] {
  return monster.bodies.flatMap((b) => b.inputs);
}

export function inputById(monster: Monster, id: string): BodyInput {
  const input = allInputs(monster).find((i) => i.id === id);
  if (input === undefined) throw new Error(`Unknown input "${id}"`);
  return input;
}

export function questionById(monster: Monster, id: string): Question {
  const q = monster.questions.find((x) => x.id === id);
  if (q === undefined) throw new Error(`Unknown question "${id}"`);
  return q;
}

/** Hearts of the main bodies (minions don't count for victory). */
export function mainHearts(monster: Monster): Cell[] {
  return monster.bodies.flatMap((b) => b.cells.filter((c) => c.kind === "heart"));
}

export function heartsAlive(state: CombatState): string[] {
  return mainHearts(state.monster)
    .filter((h) => !cs(state, h.id).destroyed)
    .map((h) => h.id);
}

/** A cell takes part in the fight: it's in a main body, or in a summoned minion. */
export function isActive(state: CombatState, cellId: string): boolean {
  const i = info(state, cellId);
  return !i.minion || state.summoned.includes(i.body.id);
}

/** A heart is exposed when a trace passed through it, or every joint guarding it is destroyed. */
export function isExposed(state: CombatState, heartId: string): boolean {
  const { cell } = info(state, heartId);
  if (cell.kind !== "heart") return false;
  if (cs(state, heartId).traced) return true;
  const guards = cell.guardJointIds ?? [];
  return guards.length > 0 && guards.every((g) => cs(state, g).destroyed);
}

export function currentPhase(state: CombatState): Monster["phases"][number] | undefined {
  return state.phase === 0 ? undefined : state.monster.phases[state.phase - 1];
}

/** The question an action on a cell asks, if there is one. */
export function questionFor(state: CombatState, action: PlayerAction, cellId: string): Question | undefined {
  const { monster } = state;
  if (action === "trace") {
    const input = allInputs(monster).find((i) => i.exitHeartId === cellId);
    return input && monster.questions.find((q) => q.action === "trace" && q.inputId === input.id);
  }
  if (action === "compare") return monster.questions.find((q) => q.action === "compare");
  return monster.questions.find((q) => q.action === action && q.cellId === cellId);
}

// ---------- setup ----------

export function createCombat(monster: Monster, balance: Balance, difficulty: Difficulty): CombatState {
  const rules = balance.difficulties[difficulty];
  const cells: Record<string, CellState> = {};
  for (const { cell } of cellIndex(monster).values()) {
    cells[cell.id] = { hp: cell.hp, destroyed: false, revealed: rules.startRevealed, traced: false };
  }
  return {
    monster,
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
    twistResolved: false,
    inputCursor: 0,
    pending: null,
    lastExecution: null,
    log: [{ tone: "info", text: monster.intro }],
    outcome: null,
    stats: { reads: 0, hints: 0, answersRight: 0, answersWrong: 0, predictionsRight: 0, predictionsWrong: 0 },
  };
}

/** Copies everything a move may change; the monster and balance are shared. */
function draft(state: CombatState): CombatState {
  const { monster, balance, ...rest } = state;
  return { ...structuredClone(rest), monster, balance };
}

// ---------- the player's turn ----------

export interface ActionCheck {
  ok: boolean;
  cost: number;
  reason?: string;
}

export function checkAction(state: CombatState, action: PlayerAction, cellId: string | null): ActionCheck {
  const cost = state.balance.costs[action];
  const no = (reason: string): ActionCheck => ({ ok: false, cost, reason });
  if (state.outcome !== null) return no("The fight is over.");
  if (state.pending !== null) return no("Answer the current question first.");
  if (action === "flee") return { ok: true, cost };
  if (cellId === null) return no("Select a cell first.");
  if (!isActive(state, cellId)) return no("That minion hasn't been summoned.");
  const { cell } = info(state, cellId);
  const c = cs(state, cellId);
  if (c.destroyed) return no("That cell is already destroyed.");
  if (state.energy < cost) return no(`Not enough Energy (needs ${cost}).`);

  switch (action) {
    case "read":
      return c.revealed ? no("Already revealed.") : { ok: true, cost };
    case "gitling":
      return state.monster.hints[cellId] === undefined ? no("Gitling has nothing to say.") : { ok: true, cost };
    case "sever":
      if (cell.kind !== "joint") return no("Only joints (◆) can be severed.");
      break;
    case "disable":
      if (cell.kind !== "organ") return no("Only organs (⚙) can be disabled.");
      break;
    case "armor":
      if (cell.kind !== "armor") return no("Only armor (🛡) can be broken.");
      break;
    case "pierce":
      if (cell.kind !== "heart") return no("Only hearts (♥) can be pierced.");
      if (!isExposed(state, cellId))
        return no("This heart isn't exposed. Sever its guards or trace a path through it.");
      break;
    case "trace":
      if (cell.kind !== "heart") return no("Trace towards a heart (♥): pick where the path ends.");
      break;
    case "compare":
      if (state.monster.twist !== "mimic") return no("Only Mimics have twins to compare.");
      if (state.twistResolved) return no("You already found the difference.");
      if (cell.kind === "heart") return no("Compare a line of code, not a heart.");
      return { ok: true, cost };
  }
  return questionFor(state, action, cellId) === undefined
    ? no(action === "trace" ? "No known input leaves through this heart." : "No question for this cell.")
    : { ok: true, cost };
}

/** Performs a player action. Actions with a question leave a pending question to answer. */
export function act(state: CombatState, action: PlayerAction, cellId: string | null): CombatState {
  const check = checkAction(state, action, cellId);
  if (!check.ok) throw new Error(check.reason);
  const next = draft(state);
  next.energy -= check.cost;
  next.lastExecution = null;

  if (action === "flee") {
    next.outcome = "fled";
    next.log.push({ tone: "info", text: "You slip away. The monster keeps its wounds for a while." });
    return next;
  }
  const id = cellId as string;
  const { cell } = info(next, id);
  if (action === "read") {
    cs(next, id).revealed = true;
    next.stats.reads += 1;
    next.log.push({ tone: "info", text: `You read line ${cell.lines[0]}: ${cell.label}` });
    return next;
  }
  if (action === "gitling") {
    next.stats.hints += 1;
    next.log.push({ tone: "info", text: `Gitling: “${next.monster.hints[id]}”` });
    return next;
  }
  if (action === "compare" && cell.twinDiff !== true) {
    for (const twin of twinsOfRow(next, cell.row)) cs(next, twin).revealed = true;
    next.log.push({ tone: "info", text: `Row ${cell.row + 1} is the same in both twins. Keep looking.` });
    return next;
  }
  const question = questionFor(next, action, id) as Question;
  next.pending = { kind: "question", questionId: question.id, action, cellId: id };
  return next;
}

function twinsOfRow(state: CombatState, row: number): string[] {
  return state.monster.bodies.flatMap((b) => b.cells.filter((c) => c.row === row).map((c) => c.id));
}

/** Answers the pending question with the index of a choice. */
export function answer(state: CombatState, choice: number): CombatState {
  const pending = state.pending;
  if (pending?.kind !== "question") throw new Error("No question to answer.");
  const question = questionById(state.monster, pending.questionId);
  const next = draft(state);
  next.pending = null;

  if (choice !== question.answer) {
    next.stats.answersWrong += 1;
    next.focus -= next.balance.wrongAnswerFocusPenalty;
    next.log.push({ tone: "bad", text: "Not quite. The monster shrugs it off." });
    return settle(next);
  }

  next.stats.answersRight += 1;
  next.log.push({ tone: "good", text: question.explanation });
  const { cellId } = pending;
  switch (pending.action) {
    case "sever": {
      destroy(next, cellId);
      const limb = info(next, cellId).body.limbs.find((l) => l.jointId === cellId);
      for (const id of limb?.cellIds ?? []) destroy(next, id);
      next.log.push({
        tone: "good",
        text: `Severed! The whole limb (${(limb?.cellIds.length ?? 0) + 1} cells) falls.`,
      });
      break;
    }
    case "pierce":
      destroy(next, cellId);
      next.log.push({ tone: "good", text: "Heart pierced!" });
      break;
    case "disable":
      destroy(next, cellId);
      next.log.push({ tone: "good", text: "Organ disabled. It won't summon anything now." });
      break;
    case "armor":
      destroy(next, cellId);
      break;
    case "trace": {
      const input = inputById(next.monster, question.inputId as string);
      strikePath(next, input.pathCellIds, next.balance.traceDamage);
      next.log.push({ tone: "good", text: "Trace Strike! The path lights up and its heart is exposed." });
      break;
    }
    case "compare": {
      for (const body of next.monster.bodies) {
        for (const c of body.cells) {
          if (c.twinDiff === true) destroy(next, c.id);
          if (c.kind === "heart") cs(next, c.id).traced = true;
        }
      }
      next.twistResolved = true;
      next.log.push({ tone: "good", text: "You found the difference! Both twins' hearts are exposed." });
      break;
    }
    default:
      break;
  }
  return settle(next);
}

function destroy(state: CombatState, cellId: string): void {
  const c = cs(state, cellId);
  c.destroyed = true;
  c.revealed = true;
  c.hp = 0;
}

/** Damages body and organ cells on a path, reveals it, and exposes its hearts. */
function strikePath(state: CombatState, pathCellIds: readonly string[], damage: number): void {
  for (const id of pathCellIds) {
    const c = cs(state, id);
    if (c.destroyed) continue;
    c.revealed = true;
    const { kind } = info(state, id).cell;
    if (kind === "heart") c.traced = true;
    else if (kind === "body" || kind === "organ") {
      c.hp = Math.max(0, c.hp - damage);
      if (c.hp === 0) destroy(state, id);
    }
  }
}

/** Phase changes, victory and defeat. */
function settle(state: CombatState): CombatState {
  const alive = heartsAlive(state).length;
  const nextPhase = state.monster.phases[state.phase];
  if (nextPhase !== undefined && alive > 0 && alive <= nextPhase.heartsLeft) {
    state.phase += 1;
    state.log.push({ tone: "monster", text: `${nextPhase.name}. ${nextPhase.telegraph}` });
    if (nextPhase.rehide) {
      for (const body of state.monster.bodies) {
        for (const cell of body.cells) {
          const c = cs(state, cell.id);
          if (!c.destroyed) c.revealed = false;
        }
      }
    }
  }
  if (alive === 0) {
    state.outcome = "victory";
    state.pending = null;
    state.log.push({ tone: "good", text: `${state.monster.name} falls! Its body becomes a map in your Codex.` });
  } else if (state.focus <= 0) {
    state.focus = 0;
    state.outcome = "defeat";
    state.pending = null;
    state.log.push({ tone: "bad", text: "Your Focus is gone. You retreat to think it over." });
  }
  return state;
}

// ---------- the monster's turn ----------

/** Ends the player's turn: organs may summon, then the monster executes an input or uses its smell attack. */
export function endTurn(state: CombatState): CombatState {
  if (state.outcome !== null) throw new Error("The fight is over.");
  if (state.pending !== null) throw new Error("Answer the current question first.");
  const next = draft(state);
  next.lastExecution = null;

  for (const body of next.monster.bodies) {
    for (const cell of body.cells) {
      if (cell.minionId === undefined || cs(next, cell.id).destroyed || next.summoned.includes(cell.minionId)) continue;
      const ignored = (next.organIgnored[cell.id] ?? 0) + 1;
      next.organIgnored[cell.id] = ignored;
      if (ignored >= next.balance.organSummonAfterTurns) {
        next.summoned.push(cell.minionId);
        next.log.push({
          tone: "monster",
          text: `The organ on line ${cell.lines[0]} summons ${cell.calleeId} as a minion!`,
        });
      }
    }
  }

  const inputs = allInputs(next.monster);
  for (let k = 0; k < inputs.length; k++) {
    const index = (next.inputCursor + k) % inputs.length;
    const input = inputs[index] as BodyInput;
    if (!cs(next, input.exitHeartId).destroyed) {
      next.inputCursor = (index + 1) % inputs.length;
      next.pending = { kind: "prediction", inputId: input.id };
      next.log.push({ tone: "monster", text: `Incoming: ${input.telegraph}! Which heart will it leave through?` });
      return next;
    }
  }

  const attack = next.monster.smellAttack;
  if (next.monster.twist === "mimic" && next.twistResolved) {
    next.log.push({ tone: "info", text: "The Mimic's glare has lost its power." });
  } else {
    next.focus -= attack.focusDamage;
    next.log.push({ tone: "monster", text: `${attack.name}: ${attack.text} (−${attack.focusDamage} Focus)` });
  }
  return finishMonsterTurn(next);
}

/** The free reaction: predict which heart the telegraphed input leaves through. */
export function predict(state: CombatState, heartId: string): CombatState {
  const pending = state.pending;
  if (pending?.kind !== "prediction") throw new Error("Nothing to predict.");
  const input = inputById(state.monster, pending.inputId);
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

/** Minions hit, then a new player turn starts. */
function finishMonsterTurn(state: CombatState): CombatState {
  for (const minionId of state.summoned) {
    const minion = state.monster.minions.find((m) => m.id === minionId);
    const alive = minion?.cells.some((c) => c.kind === "heart" && !cs(state, c.id).destroyed);
    if (minion !== undefined && alive === true) {
      state.focus -= state.balance.minionDamage;
      state.log.push({ tone: "monster", text: `${minion.name} bites! (−${state.balance.minionDamage} Focus)` });
    }
  }
  settle(state);
  if (state.outcome === null) {
    state.turn += 1;
    state.energy = state.balance.energyPerTurn;
  }
  return state;
}

/** Hearts the player may choose from when predicting. */
export function predictionChoices(state: CombatState): string[] {
  return heartsAlive(state);
}
