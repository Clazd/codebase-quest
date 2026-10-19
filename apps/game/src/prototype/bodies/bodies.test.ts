import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MonsterSchema } from "../combat/schema.ts";
import { MONSTERS, monsterById, referenceProblems } from "./index.ts";

const root = new URL("../../../../../", import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8").replaceAll("\r\n", "\n");
// Read source text only. Never import, eval, transpile or run analyzed fixtures.
const task = read("fixtures/repos/tiny-ts/src/services/taskService.ts");
const taskTests = read("fixtures/repos/tiny-ts/tests/taskService.test.ts");
const dates = read("fixtures/repos/tiny-ts/src/utils/dates.ts");
const dateTests = read("fixtures/repos/tiny-ts/tests/dates.test.ts");
const handlers = read("fixtures/repos/tiny-ts/src/api/handlers.ts");
const permissions = read("fixtures/repos/tiny-ts/src/services/shareService.ts");
const teams = read("fixtures/repos/tiny-ts/src/db/teams.ts");

describe("hand-authored body data", () => {
  for (const monster of MONSTERS)
    it(`${monster.id}: schema, source ranges and references`, () => {
      expect(MonsterSchema.safeParse(monster).success).toBe(true);
      expect(referenceProblems(monster)).toEqual([]);
      for (const body of [...monster.bodies, ...monster.minions]) {
        const source = read(body.source).split("\n");
        expect(source.slice(body.code.startLine - 1, body.code.startLine - 1 + body.code.lines.length)).toEqual(
          body.code.lines,
        );
        for (const cell of body.cells) {
          expect(cell.lines[0]).toBeGreaterThanOrEqual(body.code.startLine);
          expect(cell.lines[1]).toBeLessThan(body.code.startLine + body.code.lines.length);
          expect(cell.lines[1]).toBeGreaterThanOrEqual(cell.lines[0]);
          expect(source[cell.lines[0] - 1]).toBeTruthy();
        }
      }
    });
  it("keeps complete monster bodies as golden snapshots", () => {
    expect(MONSTERS).toMatchSnapshot();
  });
});

// Independent, manually checked facts. These do not look up an answer index.
// Arithmetic uses literals; external calls are checked as syntax/type facts.
const expected: Record<string, string> = {
  "sever-c1": "{ done: false }",
  "sever-c3": "{ dueDate: 10, done: true, doneAt: 5 }",
  "sever-c4": "{ dueDate: 10, done: true, doneAt: 20 }",
  "sever-c8": "{ dueDate: 1, done: false }",
  "disable-c7": "number",
  "pierce-c2": '"open"',
  "pierce-c5": '"late"',
  "pierce-c6": '"done"',
  "pierce-c9": '"overdue"',
  "pierce-c10": "{ dueDate: 8640000000000000, done: false }",
  "trace-I1": "7",
  "trace-I2": "7 → 8 → 9 → 11",
  "trace-I3": "7 → 8 → 9 → 10",
  "trace-I4": "7 → 8 → 13 → 14",
  "compare-row3": "`getDate()` uses the server's local time zone; `getUTCDate()` uses UTC",
  "pierce-a6": '"1970-01-01"',
  "pierce-b6": '"1970-01-31"',
  "trace-IA": "5 → 6 → 7 → 8 → 9 → 10",
  "disable-p1": "loadTeam",
  "sever-p2": "When userId is not in team.memberIds",
  "pierce-p3": "It throws a PermissionError",
  "pierce-p4": "undefined (it's a void function)",
  "disable-m1": "query",
  "sever-m2": "When no team has that id",
  "pierce-m3": "Throws a TeamNotFoundError",
  "pierce-m4": "Team",
};

describe("independent answer audit", () => {
  it("covers every scored question once", () => {
    expect(MONSTERS.flatMap((m) => m.questions.map((q) => q.id)).sort()).toEqual(Object.keys(expected).sort());
  });
  for (const monster of MONSTERS)
    for (const q of monster.questions)
      it(`${monster.id}/${q.id}: grounded choice`, () => {
        expect(q.choices[q.answer]).toBe(expected[q.id]);
        expect(q.evidence).toMatch(/\.ts:|\.d\.ts:/);
        if (monster.id === "serpent") {
          expect(task).toContain('if (!task.dueDate) return "open";');
          expect(task).toContain('if (task.doneAt > task.dueDate)\n      return "late";\n    return "done";');
          expect(task).toContain('if (now > task.dueDate) return "overdue";\n  return "open";');
          for (const [args, value] of [
            ["{ done: false }", "open"],
            ["{ dueDate: 10, done: true, doneAt: 5 }", "done"],
            ["{ dueDate: 10, done: true, doneAt: 20 }", "late"],
            ["{ dueDate: 1, done: false }", "overdue"],
          ]) {
            expect(taskTests).toContain(`expect(computeTaskStatus(${args})).toBe("${value}")`);
          }
          expect(20 > 10).toBe(true);
          expect(5 > 10).toBe(false);
          expect(100 > 1).toBe(true);
          expect(100 > 8640000000000000).toBe(false);
          if (q.id === "disable-c7") {
            const platformClock: () => number = Date.now;
            expect(typeof platformClock()).toBe("number");
          }
        } else if (monster.id === "mimic") {
          expect(dates).toContain('String(date.getUTCDate()).padStart(2, "0")');
          expect(handlers).toContain('String(date.getDate()).padStart(2, "0")');
          expect(dateTests).toContain('expect(formatDate(0)).toBe("1970-01-01")');
          // Fixed platform semantics for 1970-01-01T00:00Z: UTC year/month 1970/01,
          // local day in the prompt's UTC−5 zone is 31. No fixture code executed.
          const utc = new Date(0);
          const local = new Date(0 - 5 * 60 * 60 * 1000);
          expect(`${utc.getUTCFullYear()}-01-${local.getUTCDate()}`).toBe("1970-01-31");
        } else {
          expect(permissions).toContain("const team = loadTeam(task.teamId);");
          expect(permissions).toContain("if (!team.memberIds.includes(userId))");
          expect(permissions).toContain("throw new PermissionError(");
          expect(permissions).toContain("checkPermissions(task: Task, userId: string): void");
          expect(teams).toContain('const [team] = query<Team>("teams", { id: teamId });');
          expect(teams).toContain("if (!team) throw new TeamNotFoundError(");
          expect(teams).toContain("loadTeam(teamId: string): Team");
        }
      });
});

describe("literal control flow audit", () => {
  it("checks every serpent input against the fixture conditions", () => {
    const body = monsterById("serpent").bodies[0];
    if (!body) throw new Error("missing body");
    for (const input of body.inputs) {
      const t = input.args[0] as { done: boolean; dueDate?: number; doneAt?: number };
      let path: string[];
      if (!t.dueDate) path = ["c1", "c2"];
      else if (t.done) path = ["c1", "c3", "c4", (t.doneAt ?? 0) > t.dueDate ? "c5" : "c6"];
      else path = ["c1", "c3", "c7", "c8", 100 > t.dueDate ? "c9" : "c10"];
      if (!t.done && t.dueDate) expect(input.now).toBe(100);
      expect(input.pathCellIds).toEqual(path);
      expect(input.exitHeartId).toBe(path.at(-1));
      expect(input.evidence).toMatch(/tests\/taskService.test.ts:\d+/);
    }
  });
  it("checks the straight-line Mimic path and the hand-authored call chain", () => {
    expect(monsterById("mimic").bodies[0]?.inputs[0]?.pathCellIds).toEqual(["a1", "a2", "a3", "a4", "a5", "a6"]);
    expect(permissions).toContain("checkPermissions(task, userId)");
    expect(permissions).toContain("loadTeam(task.teamId)");
    expect(teams).toContain("query<Team>");
  });
});
