import {
  act,
  answer,
  type Balance,
  type CombatState,
  createCombat,
  type Difficulty,
  type Encounter,
  EncounterSchema,
  endTurn,
  type PlayerAction,
  predict,
  publicView,
  testAnswerKey,
} from "@codebase-quest/combat";
import balanceJson from "@codebase-quest/combat/balance.json" with { type: "json" };
import { z } from "zod";

export const balance = balanceJson as Balance;
export const EncounterIndexSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    level: z.number(),
    smellId: z.string().nullable(),
    symbolId: z.string().nullable(),
    regionId: z.string(),
    position: z.object({ mapId: z.string(), x: z.number().int(), y: z.number().int() }),
    fightable: z.boolean(),
    reason: z.string().nullable(),
  }),
);
export type EncounterIndex = z.infer<typeof EncounterIndexSchema>;
export type FightEnd = { encounter: Encounter; state: CombatState };
const DIFFICULTY_KEY = "cq:settings:difficulty";

/**
 * Owns the current fight. The rules (and the answer key) stay in
 * `@codebase-quest/combat`; the UI reads `publicView` and calls these methods.
 */
export class CombatController {
  state: CombatState | null = null;
  difficulty: Difficulty = "normal";
  /** Phase 07 rewards are session-only. Phase 08 owns saving and progression. */
  readonly rewards = { xp: 0, hintPotions: 0 };
  private readonly rewarded = new Set<string>();
  /** Flee memory: a fled monster keeps its wounds for `fleeMemorySeconds`. */
  private readonly memory = new Map<string, { cells: CombatState["cells"]; summoned: string[]; until: number }>();
  private readonly listeners = new Set<() => void>();
  onEnd: (end: FightEnd) => void = () => {};
  private readonly url: string;
  private readonly request: typeof fetch;
  private readonly cache = new Map<string, Promise<Encounter>>();
  constructor(worldUrl: string, request: typeof fetch = fetch) {
    this.url = worldUrl;
    this.request = (...args) => request(...args);
    try {
      const saved = localStorage.getItem(DIFFICULTY_KEY);
      if (saved === "story" || saved === "normal" || saved === "expert") this.difficulty = saved;
    } catch {}
  }
  setDifficulty(d: Difficulty) {
    this.difficulty = d;
    try {
      localStorage.setItem(DIFFICULTY_KEY, d);
    } catch {}
    this.emit();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit() {
    for (const l of [...this.listeners]) l();
  }
  get active(): boolean {
    return Boolean(this.state);
  }
  /** Fetches and validates one encounter (only its own file: fights load lazily). */
  load(id: string): Promise<Encounter> {
    let pending = this.cache.get(id);
    if (!pending) {
      if (!/^[\w-]{1,80}$/.test(id)) return Promise.reject(new Error("Bad encounter ID"));
      pending = (async () => {
        const r = await this.request(new URL(`encounters/${id}.json`, this.url).href);
        if (!r.ok) throw new Error(`Encounter ${id} unavailable (${r.status})`);
        return EncounterSchema.parse(await r.json());
      })();
      this.cache.set(id, pending);
      pending.catch(() => this.cache.delete(id));
    }
    return pending;
  }
  start(encounter: Encounter, now = Date.now()) {
    let s = createCombat(encounter, balance, this.difficulty);
    s.potions += this.rewards.hintPotions;
    this.rewards.hintPotions = 0;
    const remembered = this.memory.get(encounter.id);
    if (remembered && remembered.until > now) {
      s = { ...s, cells: structuredClone(remembered.cells), summoned: [...remembered.summoned] };
      s.log.push({ tone: "info", text: "It still bears the wounds from your last encounter." });
    }
    this.state = s;
    this.emit();
  }
  private update(next: CombatState) {
    this.state = next;
    this.emit();
  }
  act(action: PlayerAction, cellId: string | null) {
    if (this.state) this.update(act(this.state, action, cellId));
  }
  answer(choice: number) {
    if (this.state) this.update(answer(this.state, choice));
  }
  predict(heartId: string) {
    if (this.state) this.update(predict(this.state, heartId));
  }
  endTurn() {
    if (this.state) this.update(endTurn(this.state));
  }
  /** Leaves the finished fight and reports it to the world. */
  close(now = Date.now()) {
    const s = this.state;
    if (!s?.outcome) return;
    if (s.outcome === "fled")
      this.memory.set(s.encounter.id, {
        cells: structuredClone(s.cells),
        summoned: [...s.summoned],
        until: now + s.balance.fleeMemorySeconds * 1000,
      });
    else this.memory.delete(s.encounter.id);
    if ((s.outcome === "victory" || s.outcome === "tamed") && !this.rewarded.has(s.encounter.id)) {
      this.rewarded.add(s.encounter.id);
      this.rewards.xp += s.xp + 10;
      this.rewards.hintPotions++;
    }
    this.state = null;
    this.emit();
    this.onEnd({ encounter: s.encounter, state: s });
  }
  view() {
    return this.state ? publicView(this.state) : null;
  }
  /** Test builds only (see main.ts): the pending answer index. */
  testKey(): number | null {
    return this.state ? testAnswerKey(this.state) : null;
  }
}
