/** biome-ignore-all lint/style/noNonNullAssertion: Missing fixture facts should fail immediately. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "../../combat/src/test-fixtures.ts";
import { buildFactBook } from "../../content/src/facts.ts";
import { streak } from "./achievements.ts";
import { dailyQuest, QuestEngine } from "./engine.ts";
import { generateQuests, makeQuest } from "./generate.ts";
import type { Atlas, QuestDef } from "./model.ts";
import { levelFor, light, SKILLS, stars } from "./progression.ts";
import { newSave, parseSave, reconcile, SaveStorage } from "./save.ts";

const now = () => "2026-10-19T12:00:00Z";
let cached: Promise<Atlas> | null = null;
function data() {
  cached ??= (async () => {
    const f = await fixture("tiny-ts");
    return generateQuests(
      f.world,
      f.graph,
      buildFactBook(f.graph, f.world),
      (path) => f.sources.get(path) ?? null,
      f.index,
    );
  })();
  return cached;
}
async function engine(definitions?: QuestDef[]) {
  const atlas = structuredClone(await data());
  if (definitions) atlas.quests = definitions;
  return new QuestEngine(atlas, newSave(atlas, { mapId: "overworld", x: 1, y: 1 }, now()), now);
}
describe("quest event state machine", () => {
  it("locks prerequisites, rejects out of order events and grants rewards exactly once", async () => {
    const one = makeQuest(
      "one",
      "main",
      "One",
      [
        { kind: "talk", symbolId: "a" },
        { kind: "talk", symbolId: "b" },
      ],
      { ordered: true },
    );
    const two = makeQuest("two", "main", "Two", [{ kind: "talk", symbolId: "b" }], { prerequisites: ["one"] });
    const e = await engine([one, two]);
    expect(e.accept("two")).toBe(false);
    expect(e.accept("one")).toBe(true);
    e.dispatch({ kind: "talk", symbolId: "b" });
    expect(e.save.quests.one?.counts).toEqual([0, 0]);
    e.dispatch({ kind: "talk", symbolId: "a" });
    e.dispatch({ kind: "talk", symbolId: "b" });
    expect(e.save.quests.one?.state).toBe("completed");
    expect(e.save.quests.two?.state).toBe("available");
    const before = structuredClone(e.save.player);
    e.dispatch({ kind: "talk", symbolId: "b" });
    expect(e.save.player).toEqual(before);
    expect(e.accept("two")).toBe(true);
  });
  it("limits active side quests to three and permits unordered objectives", async () => {
    const quests = Array.from({ length: 4 }, (_, i) =>
      makeQuest(String(i), "exploration", String(i), [
        { kind: "visit", buildingId: "a" },
        { kind: "visit", buildingId: "b" },
      ]),
    );
    const e = await engine(quests);
    for (const q of quests.slice(0, 3)) expect(e.accept(q.id)).toBe(true);
    expect(e.accept("3")).toBe(false);
    expect(e.setAside("0")).toBe(true);
    expect(e.accept("3")).toBe(true);
    expect(e.setAside("3")).toBe(true);
    expect(e.accept("0")).toBe(true);
    e.dispatch({ kind: "visit", buildingId: "b", regionId: "r" });
    e.dispatch({ kind: "visit", buildingId: "b", regionId: "r" });
    expect(e.save.quests["0"]?.counts).toEqual([0, 1]);
    e.dispatch({ kind: "visit", buildingId: "a", regionId: "r" });
    expect(e.accept("3")).toBe(true);
  });
  it("delivery requires each stop in order; investigations accept any verified match", async () => {
    const e = await engine([
      makeQuest("d", "delivery", "Carry", [{ kind: "deliver", path: ["a", "b"] }]),
      makeQuest("f", "investigation", "Find", [{ kind: "find", query: "cache", answerSymbolIds: ["a", "b"] }]),
    ]);
    e.accept("d");
    e.dispatch({ kind: "talk", symbolId: "b" });
    expect(e.save.quests.d?.counts).toEqual([0]);
    e.dispatch({ kind: "talk", symbolId: "a" });
    e.dispatch({ kind: "talk", symbolId: "b" });
    expect(e.save.quests.d?.state).toBe("completed");
    e.accept("f");
    e.dispatch({ kind: "find", symbolId: "x", query: "cache" });
    expect(e.save.quests.f?.state).toBe("active");
    e.dispatch({ kind: "find", symbolId: "b", query: "cache" });
    expect(e.save.quests.f?.state).toBe("completed");
  });
  it("rewards fights once across reloads and uses distinct evidence for mastery", async () => {
    const e = await engine();
    const id = e.atlas.symbols[0]!.id;
    const event = { kind: "answer" as const, symbolId: id, puzzleType: "signature", evidence: "one" };
    e.dispatch(event);
    e.dispatch(event);
    expect(e.save.comprehension[id]).toBe("understood");
    expect(e.save.player.xp).toBe(5);
    e.dispatch({ ...event, evidence: "two" });
    expect(e.save.comprehension[id]).toBe("mastered");
    const fight = { kind: "defeat" as const, smellId: "monster", symbolIds: [id], xp: 10 };
    e.dispatch(fight);
    const again = new QuestEngine(e.atlas, parseSave(JSON.stringify(e.save)), now);
    const xp = again.save.player.xp;
    again.dispatch(fight);
    expect(again.save.player.xp).toBe(xp);
    expect(again.save.player.gold).toBe(5);
  });
  it("skill points, prerequisites, equipment and purchases are enforced", async () => {
    const e = await engine();
    expect(e.unlock("reading-1")).toBe(false);
    e.save.player.xp = 10000000;
    e.save.player.level = levelFor(e.save.player.xp);
    expect(e.unlock("reading-2")).toBe(false);
    for (const node of SKILLS) expect(e.unlock(node.id)).toBe(true);
    expect(e.save.equipment).toHaveLength(7);
    expect(e.unlock("reading-1")).toBe(false);
    expect(e.buy("hint")).toBe(false);
    e.save.player.gold = 12;
    expect(e.buy("tonic")).toBe(true);
    expect(e.save.player.gold).toBe(0);
    expect(e.save.inventory.tonic).toBe(2);
    expect(parseSave(JSON.stringify(e.save))).toEqual(e.save);
  });
  it("daily choice is deterministic, changes by UTC date and never needs an API", async () => {
    const atlas = await data();
    expect(dailyQuest(atlas, "2026-10-19")).toEqual(dailyQuest(atlas, "2026-10-19"));
    expect(dailyQuest(atlas, "2026-10-19")).toMatchSnapshot();
    expect(dailyQuest(atlas, "2026-10-20")?.id).not.toBe(dailyQuest(atlas, "2026-10-19")?.id);
    expect(streak(["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-04"])).toBe(2);
    expect(streak(Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`))).toBe(7);
  });
});
describe("light and save persistence", () => {
  it("keeps an explicit recovery checkpoint across later autosaves", async () => {
    const e = await engine(),
      map = new Map<string, string>();
    const storage = new SaveStorage(
      {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => {
          map.set(k, v);
        },
      },
      e.atlas.repoId,
    );
    storage.checkpoint(e.save);
    e.save.player.gold = 30;
    storage.write(e.save);
    e.save.player.gold = 40;
    storage.write(e.save);
    expect(storage.previous()?.player.gold).toBe(0);
    expect(storage.load()?.player.gold).toBe(40);
  });
  it("rechecks changed chapter definitions without awarding their rewards a second time", async () => {
    const q = makeQuest("one", "main", "One", [{ kind: "talk", symbolId: "a" }]);
    const e = await engine([q]);
    e.accept("one");
    e.dispatch({ kind: "talk", symbolId: "a" });
    const xp = e.save.player.xp,
      next = structuredClone(e.atlas);
    next.quests[0]!.objectives = [{ kind: "talk", symbolId: "b" }];
    const mapped = reconcile(e.save, next);
    const after = new QuestEngine(next, mapped.save, now);
    expect(after.save.quests.one?.state).toBe("available");
    after.accept("one");
    after.dispatch({ kind: "talk", symbolId: "b" });
    expect(after.save.quests.one?.state).toBe("completed");
    expect(after.save.player.xp).toBe(xp);
  });
  it("migrates a saved v0 fixture and rejects corrupted nested Codex data", () => {
    const raw = readFileSync(new URL("../fixtures/save-v0.cqsave", import.meta.url), "utf8");
    const save = parseSave(raw);
    expect(save.saveVersion).toBe(1);
    expect(save.repoId).toBe("migration-fixture");
    expect(() => parseSave(JSON.stringify({ ...save, codex: { version: 1, entries: { bad: { note: 3 } } } }))).toThrow(
      "damaged",
    );
  });
  it("matches a hand computed LOC weighted example and requires Guardian for three stars", async () => {
    const atlas = await data(),
      a = atlas.symbols[0]!,
      b = atlas.symbols[1]!;
    const test = {
      ...atlas,
      symbols: [
        { ...a, loc: 10, regionId: "r" },
        { ...b, loc: 30, regionId: "r" },
      ],
    };
    expect(light(test, { [a.id]: "read", [b.id]: "understood" })).toEqual({ kingdom: 70, regions: { r: 70 } });
    expect(light({ ...test, symbols: [] }, {}).kingdom).toBe(0);
    expect([stars(39), stars(40), stars(70), stars(90), stars(90, true)]).toEqual([0, 1, 2, 2, 3]);
    expect([levelFor(0), levelFor(99), levelFor(100), levelFor(383), levelFor(10000000)]).toEqual([1, 1, 2, 3, 30]);
  });
  it("round trips, migrates a fixture envelope, rejects corruption and keeps raw backup", async () => {
    const e = await engine();
    const raw = JSON.stringify(e.save);
    expect(parseSave(raw)).toEqual(e.save);
    expect(parseSave(JSON.stringify({ ...e.save, saveVersion: 0 }))).toEqual(e.save);
    const map = new Map<string, string>(),
      storage = new SaveStorage(
        {
          getItem: (k) => map.get(k) ?? null,
          setItem: (k, v) => {
            map.set(k, v);
          },
        },
        e.atlas.repoId,
      );
    storage.write(e.save);
    expect(() => storage.import("{broken")).toThrow("damaged");
    expect(map.get(`${storage.key}:damaged`)).toBe("{broken");
    expect(storage.load()).toEqual(e.save);
    storage.write(e.save);
    expect(map.get(`${storage.key}:backup`)).toBe(raw);
    const quota = new SaveStorage(
      {
        getItem: () => null,
        setItem: () => {
          throw Error("quota");
        },
      },
      e.atlas.repoId,
    );
    quota.write(e.save);
    expect(quota.error).toContain("Export");
    expect(() => parseSave(JSON.stringify({ ...e.save, saveVersion: 99 }))).toThrow();
    expect(() => parseSave(JSON.stringify({ ...e.save, player: { ...e.save.player, level: 30 } }))).toThrow();
  });
  it("maps unique moved definitions, downgrades edits, archives removed notes and preserves unrelated saves", async () => {
    const e = await engine();
    const [a, b, c] = e.atlas.symbols;
    if (!a || !b || !c) throw Error("fixture");
    for (const id of [a.id, b.id, c.id]) {
      e.save.comprehension[id] = "mastered";
      e.save.codexNotes[id] = "a personal note";
      e.save.evidence[id] = ["proof"];
    }
    const next = structuredClone(e.atlas);
    next.commit = "new-commit";
    next.symbols = next.symbols.filter((s) => s.id !== c.id);
    next.symbols.find((s) => s.id === a.id)!.id = "moved";
    next.symbols.find((s) => s.id === b.id)!.hash = "edited";
    const result = reconcile(e.save, next);
    expect(result.summary).toMatchObject({ renamed: 1, removed: 1, edited: 1, added: 0 });
    expect(result.save.comprehension.moved).toBe("mastered");
    expect(result.save.comprehension[b.id]).toBe("read");
    expect(result.save.evidence[b.id]).toBeUndefined();
    expect(result.save.archive[0]).toMatchObject({ id: c.id, note: "a personal note" });
    expect(e.save.comprehension[a.id]).toBe("mastered");
    expect(() => reconcile(e.save, { ...next, repoId: "other" })).toThrow("different repository");
  });
  it("runs a whole fixture story through test objectives with at least 60% Light", async () => {
    const e = await engine();
    for (const q of e.definitions.filter((q) => q.type === "main")) {
      expect(e.accept(q.id)).toBe(true);
      for (let i = 0; i < q.objectives.length; i++) e.completeObjective(q.id, i);
      expect(e.save.quests[q.id]?.state).toBe("completed");
    }
    expect(e.illumination.kingdom).toBeGreaterThanOrEqual(60);
    expect(e.save.player.level - 1).toBeGreaterThanOrEqual(12);
    expect(e.save.achievements.story).toBeDefined();
  });
});
