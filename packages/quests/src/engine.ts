import { awardAchievements } from "./achievements.ts";
import {
  type Atlas,
  type Comprehension,
  type GameEvent,
  hash,
  type Objective,
  type QuestDef,
  type QuestProgress,
  STATES,
} from "./model.ts";
import { EQUIPMENT, levelFor, light, SHOP, SKILLS } from "./progression.ts";
import type { SaveV1 } from "./save.ts";

export function dailyQuest(atlas: Atlas, day: string): QuestDef | null {
  const candidates = atlas.dailyCandidates;
  const target =
    candidates[Number(BigInt(`0x${hash(`${atlas.repoId}:${day}`)}`) % BigInt(Math.max(1, candidates.length)))];
  if (!target) return null;
  const symbol = atlas.symbols.find((s) => s.id === target.symbolId);
  const title = `Daily ${day}: ${symbol?.name ?? "code-body practice"}`;
  return {
    id: `daily:${day}`,
    type: "daily",
    title,
    summary: "Win today's seeded Code-Body fight.",
    ordered: true,
    objectives: [{ kind: "defeat", smellId: target.encounterId }],
    prerequisites: [],
    rewards: { xp: 40, gold: 15, items: ["hint"], keys: [] },
    regionId: symbol?.regionId ?? null,
    path: [target.symbolId],
    narration: { intro: title, outro: "Another day of code reading." },
  };
}
export function objectiveTotal(o: Objective) {
  return o.kind === "collect" ? o.codexIds.length : o.kind === "deliver" ? o.path.length : 1;
}
export class QuestEngine {
  readonly atlas: Atlas;
  readonly definitions: QuestDef[];
  save: SaveV1;
  notices: string[] = [];
  readonly now: () => string;
  constructor(atlas: Atlas, save: SaveV1, now: () => string = () => new Date().toISOString()) {
    this.atlas = atlas;
    this.save = save;
    this.now = now;
    const daily = dailyQuest(atlas, now().slice(0, 10));
    this.definitions = [...atlas.quests, ...(daily ? [daily] : [])];
    this.refresh();
  }
  refresh() {
    const today = dailyQuest(this.atlas, this.now().slice(0, 10));
    if (today && !this.definitions.some((q) => q.id === today.id)) this.definitions.push(today);
    for (const q of this.definitions) {
      const p = this.save.quests[q.id] ?? {
        state: "locked" as const,
        counts: q.objectives.map(() => 0),
        rewarded: false,
      };
      this.save.quests[q.id] = p;
      if (p.counts.length !== q.objectives.length) p.counts = q.objectives.map(() => 0);
      if (
        p.state === "locked" &&
        q.prerequisites.every((id) => this.save.keys.includes(id) || this.save.quests[id]?.state === "completed")
      )
        p.state = "available";
    }
  }
  accept(id: string) {
    this.refresh();
    const q = this.definitions.find((q) => q.id === id),
      p = this.save.quests[id];
    if (!q || p?.state !== "available") return false;
    if (
      q.type !== "main" &&
      this.definitions.filter((q) => q.type !== "main" && this.save.quests[q.id]?.state === "active").length >= 3
    ) {
      this.notices.push("Finish a side quest first (three active at a time).");
      return false;
    }
    p.state = "active";
    this.save.tracked = id;
    return true;
  }
  next(q: QuestDef): number {
    const p = this.save.quests[q.id];
    return q.objectives.findIndex((o, i) => (p?.counts[i] ?? 0) < objectiveTotal(o));
  }
  track(id: string) {
    if (this.save.quests[id]?.state === "active") this.save.tracked = id;
  }
  setAside(id: string) {
    const q = this.definitions.find((q) => q.id === id),
      p = this.save.quests[id];
    if (!q || q.type === "main" || p?.state !== "active") return false;
    p.state = "available";
    if (this.save.tracked === id) this.save.tracked = null;
    return true;
  }
  comprehend(id: string, state: Comprehension) {
    if (!this.atlas.symbols.some((s) => s.id === id)) return;
    if (STATES.indexOf(state) > STATES.indexOf(this.save.comprehension[id] ?? "unseen"))
      this.save.comprehension[id] = state;
  }
  private xp(amount: number) {
    this.save.player.xp += amount;
    this.save.player.level = levelFor(this.save.player.xp);
  }
  dispatch(event: GameEvent) {
    const s = this.save;
    if (event.kind === "seen") this.comprehend(event.symbolId, "seen");
    if (event.kind === "talk" || event.kind === "read") this.comprehend(event.symbolId, "read");
    if (event.kind === "answer") {
      const evidence = s.evidence[event.symbolId] ?? [];
      s.evidence[event.symbolId] = evidence;
      if (!evidence.includes(event.evidence)) {
        evidence.push(event.evidence);
        this.xp(5);
      }
      this.comprehend(event.symbolId, evidence.length >= 2 ? "mastered" : "understood");
    }
    if (event.kind === "visit") {
      if (!s.visited.includes(event.buildingId)) s.visited.push(event.buildingId);
      if (!s.regions.includes(event.regionId)) s.regions.push(event.regionId);
    }
    if (event.kind === "doc" && !s.docs.includes(event.fileId)) s.docs.push(event.fileId);
    if (event.kind === "defeat") {
      const rewardId = `fight:${event.smellId}`;
      if (!s.rewarded.includes(rewardId)) {
        s.rewarded.push(rewardId);
        this.xp(event.xp);
        s.player.gold += 5;
        s.inventory.hint = (s.inventory.hint ?? 0) + 1;
        s.bestiary[event.smellId] = { tamedAt: this.now() };
      }
      for (const id of event.symbolIds) this.comprehend(id, "understood");
    }
    for (const q of this.definitions) {
      const p = s.quests[q.id];
      if (p?.state !== "active") continue;
      const first = this.next(q);
      q.objectives.forEach((o, index) => {
        if (q.ordered && index !== first) return;
        if ((p.counts[index] ?? 0) >= objectiveTotal(o)) return;
        let n = p.counts[index] ?? 0;
        if (o.kind === "welcome" && event.kind === "welcome" && o.step === event.step) n = 1;
        if (o.kind === "visit" && event.kind === "visit" && o.buildingId === event.buildingId) n = 1;
        if (o.kind === "talk" && event.kind === "talk" && o.symbolId === event.symbolId) n = 1;
        if (o.kind === "defeat" && event.kind === "defeat" && o.smellId === event.smellId) n = 1;
        if (
          o.kind === "answer" &&
          event.kind === "answer" &&
          o.symbolId === event.symbolId &&
          (!o.puzzleTypes || o.puzzleTypes.includes(event.puzzleType))
        )
          n = 1;
        if (o.kind === "collect")
          n = o.codexIds.filter((id) => STATES.indexOf(s.comprehension[id] ?? "unseen") >= 2).length;
        if (o.kind === "deliver" && event.kind === "talk" && o.path[n] === event.symbolId) n++;
        if (
          o.kind === "find" &&
          event.kind === "find" &&
          event.query === o.query &&
          o.answerSymbolIds.includes(event.symbolId)
        )
          n = 1;
        p.counts[index] = n;
      });
      if (this.next(q) === -1) this.finish(q, p);
    }
    awardAchievements(this);
    this.refresh();
  }
  private finish(q: QuestDef, p: QuestProgress) {
    p.state = "completed";
    if (p.rewarded) return;
    p.rewarded = true;
    this.xp(q.rewards.xp);
    this.save.player.gold += q.rewards.gold;
    for (const key of q.rewards.keys) if (!this.save.keys.includes(key)) this.save.keys.push(key);
    for (const item of q.rewards.items) this.save.inventory[item] = (this.save.inventory[item] ?? 0) + 1;
    if (q.type === "daily") {
      const day = q.id.slice(6);
      if (!this.save.dailyDays.includes(day)) this.save.dailyDays.push(day);
    }
    this.notices.push(`${q.title} complete! +${q.rewards.xp} XP · +${q.rewards.gold} gold`);
    if (this.save.tracked === q.id) this.save.tracked = null;
  }
  /** Only wired into test bundles, never ordinary development or MCP. */
  completeObjective(id: string, index: number) {
    const q = this.definitions.find((q) => q.id === id),
      p = this.save.quests[id],
      o = q?.objectives[index];
    if (!q || !o || p?.state !== "active" || (q.ordered && index !== this.next(q)))
      throw new Error("Objective is not active");
    p.counts[index] = objectiveTotal(o);
    if (o.kind === "talk") this.comprehend(o.symbolId, "read");
    if (o.kind === "answer") this.comprehend(o.symbolId, "understood");
    if (this.next(q) === -1) this.finish(q, p);
    awardAchievements(this);
    this.refresh();
  }
  unlock(id: string) {
    const node = SKILLS.find((s) => s.id === id),
      skills = this.save.player.skills;
    if (
      !node ||
      skills.includes(id) ||
      skills.length >= this.save.player.level - 1 ||
      (node.prerequisite && !skills.includes(node.prerequisite))
    )
      return false;
    skills.push(id);
    if (EQUIPMENT[node.effect]) this.save.equipment.push(node.effect);
    awardAchievements(this);
    return true;
  }
  buy(id: string) {
    const item = SHOP.find((i) => i.id === id);
    if (!item || this.save.player.gold < item.price) return false;
    this.save.player.gold -= item.price;
    this.save.inventory[id] = (this.save.inventory[id] ?? 0) + 1;
    awardAchievements(this);
    return true;
  }
  gate(regionId: string) {
    return this.atlas.gates.find((g) => g.regionId === regionId && !this.save.keys.includes(g.key));
  }
  get illumination() {
    return light(this.atlas, this.save.comprehension);
  }
}
