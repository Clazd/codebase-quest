import { describe, expect, it } from "vitest";
import { monsterById } from "../bodies/index.ts";
import balanceJson from "./balance.json" with { type: "json" };
import {
  act,
  answer,
  type Balance,
  type CombatState,
  checkAction,
  createCombat,
  endTurn,
  heartsAlive,
  isExposed,
  predict,
  questionById,
} from "./engine.ts";
import { FleeMemory } from "./fleeMemory.ts";

const balance = balanceJson as Balance;
const fight = (id: string, difficulty: "story" | "normal" | "expert" = "normal") =>
  createCombat(monsterById(id), balance, difficulty);

/** Answers the pending question correctly. */
function solve(state: CombatState): CombatState {
  if (state.pending?.kind !== "question") throw new Error("no question");
  return answer(state, questionById(state.monster, state.pending.questionId).answer);
}
const wrong = (state: CombatState) => {
  if (state.pending?.kind !== "question") throw new Error("no question");
  const q = questionById(state.monster, state.pending.questionId);
  return answer(state, (q.answer + 1) % q.choices.length);
};
const cell = (s: CombatState, id: string) => s.cells[id];

describe("Energy", () => {
  it("starts each turn full and is spent by actions", () => {
    let s = fight("serpent");
    expect(s.energy).toBe(6);
    s = act(s, "read", "c1");
    expect(s.energy).toBe(5);
    expect(cell(s, "c1")?.revealed).toBe(true);
    s = act(s, "sever", "c1");
    expect(s.energy).toBe(1);
  });

  it("refuses actions that cost more than what's left", () => {
    let s = act(fight("serpent"), "sever", "c1");
    s = solve(s);
    expect(checkAction(s, "sever", "c3")).toMatchObject({ ok: false, cost: 4 });
    expect(() => act(s, "sever", "c3")).toThrow("Not enough Energy");
  });

  it("refills on the next turn", () => {
    let s = solve(act(fight("gatekeeper"), "sever", "p2"));
    s = endTurn(s); // no inputs: smell attack, then a new turn
    expect(s.turn).toBe(2);
    expect(s.energy).toBe(6);
  });

  it("spends energy on a wrong answer without effect", () => {
    const s = wrong(act(fight("serpent"), "sever", "c1"));
    expect(s.energy).toBe(2);
    expect(cell(s, "c1")?.destroyed).toBe(false);
    expect(s.stats.answersWrong).toBe(1);
  });
});

describe("Severing", () => {
  it("destroys the joint and every cell of its limb", () => {
    const s = solve(act(fight("serpent"), "sever", "c3"));
    for (const id of ["c3", "c4", "c5", "c6"]) expect(cell(s, id)?.destroyed).toBe(true);
    for (const id of ["c1", "c2", "c7", "c8", "c9", "c10"]) expect(cell(s, id)?.destroyed).toBe(false);
  });

  it("only works on joints", () => {
    expect(checkAction(fight("serpent"), "sever", "c2").ok).toBe(false);
  });
});

describe("Heart exposure", () => {
  it("hides hearts until their guards are destroyed", () => {
    let s = fight("serpent");
    expect(isExposed(s, "c10")).toBe(false);
    expect(checkAction(s, "pierce", "c10").ok).toBe(false);
    s = solve(act(s, "sever", "c1"));
    s = predict(endTurn(s), "c6"); // I1's heart is gone, so I2 comes
    s = solve(act(s, "sever", "c3"));
    expect(isExposed(s, "c10")).toBe(false);
    s = predict(endTurn(s), "c9"); // I3's heart is gone, so I4 comes
    s = solve(act(s, "sever", "c8"));
    expect(isExposed(s, "c10")).toBe(true);
    expect(heartsAlive(s)).toEqual(["c10"]);
  });

  it("exposes hearts on a traced path", () => {
    let s = act(fight("serpent"), "trace", "c5");
    s = solve(s);
    expect(isExposed(s, "c5")).toBe(true);
    expect(isExposed(s, "c6")).toBe(false);
    expect(s.energy).toBe(3);
  });

  it("exposes both Mimic hearts when the difference is found", () => {
    let s = act(fight("mimic"), "compare", "a2");
    expect(s.pending).toBeNull(); // identical rows: no question
    expect(s.energy).toBe(3);
    s = solve(act(s, "compare", "b4"));
    expect(s.twistResolved).toBe(true);
    expect(isExposed(s, "a6")).toBe(true);
    expect(isExposed(s, "b6")).toBe(true);
    expect(cell(s, "a4")?.destroyed).toBe(true);
  });
});

describe("Winning and losing", () => {
  it("wins when every heart of the main bodies is destroyed", () => {
    let s = solve(act(fight("gatekeeper"), "sever", "p2")); // destroys p3, exposes p4
    expect(s.outcome).toBeNull();
    s = endTurn(s);
    s = solve(act(s, "pierce", "p4"));
    expect(s.outcome).toBe("victory");
  });

  it("loses when Focus runs out", () => {
    let s = fight("gatekeeper", "expert"); // 14 Focus, smell attack −2, then the minion bites too
    let turns = 0;
    while (s.outcome === null && turns < 20) {
      s = endTurn(s);
      turns += 1;
    }
    expect(s.outcome).toBe("defeat");
    expect(s.focus).toBe(0);
  });

  it("costs Focus for a wrong prediction and counter-attacks for a right one", () => {
    let s = endTurn(fight("serpent"));
    expect(s.pending).toEqual({ kind: "prediction", inputId: "I1" });
    s = predict(s, "c10");
    expect(s.focus).toBe(17);
    expect(s.lastExecution).toMatchObject({ exitHeartId: "c2", correct: false });

    s = endTurn(s);
    expect(s.pending).toEqual({ kind: "prediction", inputId: "I2" });
    s = predict(s, "c6");
    expect(s.focus).toBe(17);
    expect(isExposed(s, "c6")).toBe(true);
  });

  it("enters phase 2 when 2 hearts are left: cells hide again and strikes hurt more", () => {
    let s = act(fight("serpent"), "read", "c8");
    s = solve(act(s, "sever", "c3")); // c5 and c6 fall: 3 hearts left
    expect(s.phase).toBe(0);
    s = endTurn(s);
    s = predict(s, "c2"); // I1 → c2, correct
    s = solve(act(s, "sever", "c1")); // c2 falls: 2 hearts left
    expect(s.phase).toBe(1);
    expect(cell(s, "c8")?.revealed).toBe(false);
    s = endTurn(s); // I4 → c9
    s = predict(s, "c10");
    expect(s.focus).toBe(20 - 4);
  });
});

describe("Organs and minions", () => {
  it("summons the callee as a minion after 2 ignored turns, and the minion bites", () => {
    let s = fight("gatekeeper");
    s = endTurn(s);
    expect(s.summoned).toEqual([]);
    expect(s.focus).toBe(18);
    s = endTurn(s);
    expect(s.summoned).toEqual(["loadTeam"]);
    expect(s.focus).toBe(18 - 2 - 1);
  });

  it("never summons a disabled organ", () => {
    let s = solve(act(fight("gatekeeper"), "disable", "p1"));
    s = endTurn(endTurn(endTurn(s)));
    expect(s.summoned).toEqual([]);
  });

  it("lets you fight the minion only once it's summoned", () => {
    let s = fight("gatekeeper");
    expect(checkAction(s, "read", "m1").ok).toBe(false);
    s = endTurn(endTurn(s));
    expect(checkAction(s, "read", "m1").ok).toBe(true);
  });
});

describe("Fleeing", () => {
  it("ends the fight and remembers the wounds for 60 seconds", () => {
    let clock = 1000;
    const memory = new FleeMemory(() => clock);
    let s = solve(act(fight("serpent"), "sever", "c3"));
    s = act(s, "flee", null);
    expect(s.outcome).toBe("fled");
    memory.remember(s);

    clock += 59_000;
    const resumed = memory.resume(fight("serpent"));
    expect(resumed.cells.c5?.destroyed).toBe(true);
    expect(resumed.focus).toBe(20);

    memory.remember(s);
    clock += 61_000;
    expect(memory.resume(fight("serpent")).cells.c5?.destroyed).toBe(false);
  });
});

describe("Difficulty", () => {
  it("story starts revealed with more Focus; expert has less", () => {
    expect(fight("serpent", "story").cells.c1?.revealed).toBe(true);
    expect(fight("serpent", "story").focus).toBe(30);
    expect(fight("serpent", "expert").focus).toBe(14);
    expect(fight("serpent").cells.c1?.revealed).toBe(false);
  });
});
