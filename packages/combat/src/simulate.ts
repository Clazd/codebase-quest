import {
  act,
  answer,
  type Balance,
  type CombatState,
  checkAction,
  createCombat,
  type Difficulty,
  endTurn,
  isExposed,
  type PlayerAction,
  predict,
  predictionChoices,
  questionFor,
  testAnswerKey,
} from "./rules.ts";
import type { Encounter } from "./schema.ts";

export interface SimResult {
  outcome: CombatState["outcome"] | "timeout";
  turns: number;
}
const rng = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const TWIST = [
  "investigate",
  "classify",
  "name",
  "compare",
  "hunt",
  "prove",
  "maze",
  "shape",
  "match",
  "reach",
] as const;
/** A simulated player: sensible priorities, right answers with probability `accuracy`. */
export function simulate(
  encounter: Encounter,
  balance: Balance,
  difficulty: Difficulty,
  accuracy: number,
  seed: number,
  maxTurns = 40,
): SimResult {
  const random = rng(seed);
  let s = createCombat(encounter, balance, difficulty);
  const respond = () => {
    while (s.pending?.kind === "question" && !s.outcome) {
      const key = testAnswerKey(s);
      const q = s.encounter.questions.find(
        (x) => x.id === (s.pending?.kind === "question" ? s.pending.questionId : ""),
      );
      const n = q?.choices.length ?? 2;
      const right = key === null ? 0 : key;
      const choice = key === null || random() < accuracy ? right : (right + 1 + Math.floor(random() * (n - 1))) % n;
      s = answer(s, choice);
    }
  };
  const tryAct = (action: PlayerAction, cell: string | null) => {
    if (!checkAction(s, action, cell).ok) return false;
    s = act(s, action, cell);
    respond();
    return true;
  };
  const cells = () =>
    [...s.encounter.bodies, ...s.encounter.minions.filter((m) => s.summoned.includes(m.id))].flatMap((b) => b.cells);
  const alive = (id: string) => !s.cells[id]?.destroyed;
  while (!s.outcome && s.turn <= maxTurns) {
    let acted = true;
    while (acted && !s.outcome && s.energy > 0) {
      acted = false;
      for (const t of TWIST) if (!acted && questionFor(s, t, null)) acted = tryAct(t, null);
      const list = cells().filter((c) => alive(c.id));
      for (const h of list.filter((c) => c.kind === "heart" && isExposed(s, c.id)))
        if (!acted) acted = tryAct("pierce", h.id);
      const guarding = new Set(list.filter((c) => c.kind === "heart").flatMap((h) => h.guardJointIds ?? []));
      for (const j of list.filter((c) => c.kind === "joint" && guarding.has(c.id)))
        if (!acted) acted = tryAct("sever", j.id);
      for (const h of list.filter((c) => c.kind === "heart")) if (!acted) acted = tryAct("trace", h.id);
      for (const o of list.filter((c) => c.kind === "organ")) if (!acted) acted = tryAct("disable", o.id);
      for (const a of list.filter((c) => c.kind === "armor")) if (!acted) acted = tryAct("armor", a.id);
      for (const j of list.filter((c) => c.kind === "joint")) if (!acted) acted = tryAct("sever", j.id);
      if (!acted) acted = tryAct("trace", null);
      for (const b of list.filter((c) => c.kind === "body")) if (!acted) acted = tryAct("trace", b.id);
    }
    if (s.outcome) break;
    s = endTurn(s);
    if (s.pending?.kind === "prediction") {
      const choices = predictionChoices(s);
      const key = testAnswerKey(s) ?? 0;
      const pick = choices.length < 2 || random() < accuracy ? key : (key + 1) % choices.length;
      s = predict(s, choices[pick] as string);
    }
  }
  return { outcome: s.outcome ?? "timeout", turns: s.turn };
}
export interface BalanceReport {
  accuracy: number;
  difficulty: Difficulty;
  fights: number;
  meanTurns: number;
  defeatRate: number;
  timeoutRate: number;
}
/** Plays every encounter `runs` times per accuracy level. */
export function balanceReport(
  encounters: readonly Encounter[],
  balance: Balance,
  difficulty: Difficulty,
  accuracy: number,
  runs = 20,
): BalanceReport {
  let turns = 0,
    defeats = 0,
    timeouts = 0,
    fights = 0;
  encounters.forEach((e, i) => {
    for (let r = 0; r < runs; r++) {
      const result = simulate(e, balance, difficulty, accuracy, i * 1000 + r);
      fights++;
      turns += result.turns;
      if (result.outcome === "defeat") defeats++;
      if (result.outcome === "timeout") timeouts++;
    }
  });
  return {
    accuracy,
    difficulty,
    fights,
    meanTurns: turns / Math.max(1, fights),
    defeatRate: defeats / Math.max(1, fights),
    timeoutRate: timeouts / Math.max(1, fights),
  };
}
