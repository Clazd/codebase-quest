import type { QuestEngine } from "./engine.ts";
export const ACHIEVEMENTS = [
  ["first-steps", "First Steps", "Read one NPC"],
  ["reader", "Reader", "Read ten NPCs"],
  ["scholar", "Scholar", "Read twenty-five NPCs"],
  ["cartographer", "Cartographer", "Visit every inhabited region"],
  ["visitor", "Visitor", "Visit one building"],
  ["explorer", "Explorer", "Visit ten buildings"],
  ["first-tame", "First Tame", "Tame one monster"],
  ["hunter", "Hunter", "Tame ten monsters"],
  ["exterminator", "Exterminator", "Tame fifty monsters"],
  ["prologue", "Welcome Home", "Complete the prologue"],
  ["chapter", "First Chapter", "Complete chapter one"],
  ["story", "Architecture Apprentice", "Complete every chapter"],
  ["librarian", "Librarian", "Read every documentation scroll"],
  ["night-owl", "Night Owl", "Complete dailies on seven consecutive UTC dates"],
  ["daily", "Daily Practice", "Complete a daily"],
  ["illuminated", "Illuminated", "Reach 100% Light in one region"],
  ["dawn", "Dawn", "Reach 40% Kingdom Light"],
  ["radiant", "Radiant", "Reach 70% Kingdom Light"],
  ["apprentice", "Apprentice", "Unlock a skill"],
  ["specialist", "Specialist", "Finish one skill branch"],
  ["level-five", "Seasoned Pathfinder", "Reach level five"],
  ["collector", "Collector", "Own a cosmetic"],
  ["master", "Code Reader", "Master five symbols using distinct evidence"],
] as const;
export function streak(days: string[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0,
    current = 0,
    previous = 0;
  for (const day of sorted) {
    const time = Date.parse(`${day}T00:00:00Z`);
    current = time - previous === 86400000 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = time;
  }
  return best;
}
export function awardAchievements(e: QuestEngine) {
  const s = e.save,
    values = Object.values(s.comprehension),
    read = values.filter((v) => ["read", "understood", "mastered"].includes(v)).length;
  const completed = (id: string) => s.quests[id]?.state === "completed";
  const light = e.illumination,
    tamed = Object.keys(s.bestiary).length;
  const chapters = e.definitions.filter((q) => q.type === "main" && (q.chapter ?? 0) > 0);
  const docs = e.atlas.files.filter((f) => /(?:\.md|\.rst|\.txt)$/i.test(f.path));
  const conditions: Record<string, boolean> = {
    "first-steps": read >= 1,
    reader: read >= 10,
    scholar: read >= 25,
    visitor: s.visited.length >= 1,
    explorer: s.visited.length >= 10,
    cartographer: s.regions.length >= new Set(e.atlas.symbols.map((s) => s.regionId)).size && s.regions.length > 0,
    "first-tame": tamed >= 1,
    hunter: tamed >= 10,
    exterminator: tamed >= 50,
    prologue: completed("prologue"),
    chapter: completed("chapter:1"),
    story: chapters.length > 0 && chapters.every((q) => completed(q.id)),
    librarian: docs.length > 0 && docs.every((f) => s.docs.includes(f.id)),
    "night-owl": streak(s.dailyDays) >= 7,
    daily: s.dailyDays.length > 0,
    illuminated: Object.values(light.regions).some((v) => v >= 99.999999),
    dawn: light.kingdom >= 40,
    radiant: light.kingdom >= 70,
    apprentice: s.player.skills.length > 0,
    specialist: s.player.skills.some((id) => id.endsWith("-5")),
    "level-five": s.player.level >= 5,
    collector: (s.inventory.hat ?? 0) > 0 || (s.inventory.color ?? 0) > 0,
    master: values.filter((v) => v === "mastered").length >= 5,
  };
  for (const [id, title] of ACHIEVEMENTS)
    if (conditions[id] && !s.achievements[id]) {
      s.achievements[id] = e.now();
      e.notices.push(`Achievement: ${title}`);
    }
}
