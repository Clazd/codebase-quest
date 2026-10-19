/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { beforeAll, describe, expect, it } from "vitest";
import balanceJson from "./balance.json" with { type: "json" };
import {
  act,
  answer,
  type Balance,
  checkAction,
  createCombat,
  endTurn,
  isExposed,
  predict,
  predictionChoices,
  publicView,
  testAnswerKey,
} from "./rules.ts";
import { balanceReport, simulate } from "./simulate.ts";
import { fixture } from "./test-fixtures.ts";

const balance = balanceJson as Balance;
let tiny: Awaited<ReturnType<typeof fixture>>, smelly: typeof tiny;
beforeAll(async () => {
  tiny = await fixture("tiny-ts");
  smelly = await fixture("smelly-ts");
});
const find = (kind: string) => [...smelly.encounters.values()].find((e) => e.kind === kind)!;
function solve(state: ReturnType<typeof createCombat>, action: Parameters<typeof act>[1], id: string | null = null) {
  const s = act(state, action, id);
  return answer(s, testAnswerKey(s) ?? 0);
}
describe("generated combat", () => {
  it("starts at the prototype balance and respects difficulty visibility", () => {
    for (const difficulty of ["story", "normal", "expert"] as const) {
      const s = createCombat(find("serpent"), balance, difficulty);
      expect(s.focus).toBe({ story: 30, normal: 20, expert: 14 }[difficulty]);
      expect(s.energy).toBe(6);
      expect(Object.values(s.cells).every((c) => c.revealed === (difficulty === "story"))).toBe(true);
    }
  });
  it("spends energy, leaves previous states immutable, and refuses illegal moves", () => {
    const s = createCombat(find("serpent"), balance, "normal");
    const id = s.encounter.bodies[0]!.cells[0]!.id;
    const before = JSON.stringify(s);
    const next = act(s, "read", id);
    expect(next.energy).toBe(5);
    expect(JSON.stringify(s)).toBe(before);
    expect(() => act(next, "read", id)).toThrow();
    expect(() => act(s, "pierce", id)).toThrow();
    expect(checkAction({ ...s, energy: 0 }, "sever", id).ok).toBe(false);
  });
  it("severs every nested limb cell and exposes dependent hearts", () => {
    const s = createCombat(find("serpent"), balance, "normal");
    const limb = s.encounter.bodies[0]!.limbs[0]!;
    const next = solve(s, "sever", limb.jointId);
    for (const id of [limb.jointId, ...limb.cellIds]) expect(next.cells[id]!.destroyed).toBe(true);
    expect(next.energy).toBe(2);
  });
  it("wrong answers consume energy without earning understanding", () => {
    const s = act(
      createCombat(find("serpent"), balance, "normal"),
      "sever",
      find("serpent").bodies[0]!.limbs[0]!.jointId,
    );
    const next = answer(s, (testAnswerKey(s)! + 1) % publicView(s).question!.choices.length);
    expect(next.understood).toEqual([]);
    expect(next.stats.answersWrong).toBe(1);
    expect(next.energy).toBe(2);
    expect(() => answer(s, -1)).toThrow();
  });
  it("consumables add energy, recall known notes and allow escape from a pending question", () => {
    let s = createCombat(find("serpent"), balance, "normal");
    s = act(s, "tonic", null);
    expect(s.energy).toBe(9);
    expect(() => act(s, "tonic", null)).toThrow();
    s = act(s, "recall", null);
    expect(s.recalled).toBe(true);
    expect(s.items.recallScrolls).toBe(0);
    s = act(s, "sever", s.encounter.bodies[0]!.limbs[0]!.jointId);
    s = act(s, "smoke", null);
    expect(s.outcome).toBe("fled");
    expect(s.pending).toBeNull();
  });
  it("traces expose hearts without destroying joints or hearts (ADR 0003)", () => {
    let s = createCombat(find("minotaur"), balance, "normal");
    const q = s.encounter.questions.find((q) => q.type === "path")!;
    s = solve(s, "trace", q.cellId!);
    expect(isExposed(s, q.cellId!)).toBe(true);
    expect(
      s.encounter.bodies[0]!.cells.filter((c) => c.kind === "joint" || c.kind === "heart").every(
        (c) => !s.cells[c.id]!.destroyed,
      ),
    ).toBe(true);
  });
  it("handles free exit predictions and refills energy once per turn", () => {
    const original = createCombat(find("minotaur"), balance, "normal");
    let s = endTurn(original);
    expect(s.pending?.kind).toBe("prediction");
    const key = testAnswerKey(s)!;
    s = predict(s, predictionChoices(s)[key]!);
    expect(s.focus).toBe(20);
    expect(s.turn).toBe(2);
    expect(s.energy).toBe(6);
    expect(s.lastExecution?.correct).toBe(true);
    s = endTurn(original);
    const wrong = predictionChoices(s).find((_, i) => i !== testAnswerKey(s))!;
    s = predict(s, wrong);
    expect(s.focus).toBe(17);
  });
  it("summons a real callee after two ignored turns and minions inflict one damage", () => {
    const e = [...tiny.encounters.values()].find((e) => e.minions.length && !e.bodies[0]!.inputs.length)!;
    let s = createCombat(e, balance, "story");
    s = endTurn(s);
    expect(s.summoned).toHaveLength(0);
    const focus = s.focus;
    s = endTurn(s);
    expect(s.summoned.length).toBeGreaterThan(0);
    expect(s.focus).toBeLessThanOrEqual(focus - 1);
    const minion = e.minions.find((m) => s.summoned.includes(m.id))!;
    expect(minion.cells.length).toBeLessThanOrEqual(5);
    const hp = s.focus;
    s = endTurn(s);
    expect(s.focus).toBeLessThan(hp);
  });
  it("disabling an organ prevents its summon", () => {
    const e = [...tiny.encounters.values()].find((e) => e.minions.length && !e.bodies[0]!.inputs.length)!;
    let s = createCombat(e, balance, "story");
    for (const organ of e.bodies[0]!.cells.filter((c) => c.minionId)) {
      if (s.energy < 3) s = endTurn(s);
      s = solve(s, "disable", organ.id);
    }
    s = endTurn(endTurn(s));
    expect(s.summoned).toHaveLength(0);
  });
  it("potions remove wrong choices and the evidence ladder consumes a potion only at rung three", () => {
    let s = createCombat(find("serpent"), balance, "normal");
    const id = s.encounter.bodies[0]!.limbs[0]!.jointId;
    s = act(s, "sever", id);
    if (publicView(s).question!.choices.length > 2) {
      s = act(s, "potion", null);
      expect(s.pending?.kind === "question" && s.pending.removed.includes(testAnswerKey(s)!)).toBe(false);
      expect(s.potions).toBe(1);
    }
    s = createCombat(find("serpent"), balance, "normal");
    for (let i = 0; i < 3; i++) s = act(s, "gitling", id);
    expect(s.potions).toBe(1);
    expect(s.energy).toBe(0);
    expect(s.ladder[id]).toBe(3);
    expect(s.understood).toEqual([]);
  });
  it("opinion twists never earn understanding", () => {
    for (const [kind, action] of [
      ["gremlin", "classify"],
      ["imp", "name"],
      ["wisp", "investigate"],
    ] as const) {
      const s = solve(createCombat(find(kind), balance, "story"), action);
      expect(s.understood).toEqual([]);
      expect(Object.keys(s.opinions)).toHaveLength(1);
      if (kind === "wisp") expect(s.outcome).toBe("tamed");
    }
  });
  it("Mutant corruption spreads visually while its original question stays fixed", () => {
    const e = find("mutant");
    const q = JSON.stringify(e.questions.find((q) => q.type === "mutant-hunt"));
    let s = createCombat(e, balance, "story");
    s = endTurn(s);
    expect(s.spread).toHaveLength(1);
    expect(JSON.stringify(e.questions.find((q) => q.type === "mutant-hunt"))).toBe(q);
  });
  it("victory, defeat and flee reach terminal states", () => {
    expect(solve(createCombat(find("ghost"), balance, "normal"), "prove").outcome).toBe("victory");
    let s = createCombat(find("serpent"), balance, "expert");
    for (let i = 0; i < 30 && !s.outcome; i++) s = endTurn(s);
    expect(s.outcome).toBe("defeat");
    expect(s.focus).toBe(0);
    const fled = act(createCombat(find("serpent"), balance, "normal"), "flee", null);
    expect(fled.outcome).toBe("fled");
    expect(() => endTurn(fled)).toThrow();
  });
  it("public fight views omit every answer, route and expected exit", () => {
    let s = createCombat(find("minotaur"), balance, "normal");
    s = act(s, "sever", s.encounter.bodies[0]!.limbs[0]!.jointId);
    for (const view of [publicView(s), publicView(endTurn(createCombat(find("minotaur"), balance, "normal")))]) {
      const walk = (x: unknown) => {
        if (x && typeof x === "object")
          for (const [k, v] of Object.entries(x)) {
            expect(["answer", "exitHeartId", "pathCellIds", "explanation"].includes(k)).toBe(false);
            walk(v);
          }
      };
      walk(view);
    }
  });
  it("all twelve monster types can be finished with deterministic actions", () => {
    for (const e of smelly.encounters.values()) {
      const result = simulate(e, balance, "story", 1, 1);
      expect(result.outcome, e.name).toMatch(/victory|tamed/);
    }
  });
  it("simulates 40/60/80 percent accuracy and meets the Story defeat budget", () => {
    const encounters = [...tiny.encounters.values(), ...smelly.encounters.values()];
    const reports = [0.4, 0.6, 0.8].map((a) => balanceReport(encounters, balance, "story", a, 20));
    console.log("Phase 07 balance", JSON.stringify(reports));
    expect(reports[1]!.defeatRate).toBeLessThan(0.15);
    expect(reports[1]!.timeoutRate).toBe(0);
    // Fixture smells start at severity 1 (world level 2). Normalize severity,
    // keeping their real generated cells and questions, for the level-1 budget.
    const level1 = encounters
      .filter((e) => !["wisp", "ghost"].includes(e.kind))
      .map((e) => ({ ...e, level: 1, smellAttack: { ...e.smellAttack, focusDamage: 1 } }));
    const pacing = balanceReport(level1, balance, "normal", 0.6, 40);
    console.log("Phase 07 level-1 pacing", JSON.stringify(pacing));
    expect(pacing.meanTurns).toBeGreaterThanOrEqual(3);
    expect(pacing.meanTurns).toBeLessThanOrEqual(6);
  });
});
