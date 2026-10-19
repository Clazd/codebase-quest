import { exportBestiary } from "../npc/codex.ts";
import type { OverlayStore } from "../overlay/store.ts";

const ICONS = { joint: "◆", body: "■", organ: "⚙", armor: "⬟", heart: "♥" };
export function FightCodex({ store, symbolId }: { store: OverlayStore; symbolId?: string }) {
  const map = symbolId ? store.codex.data.bodyMaps[symbolId] : null;
  return (
    <section aria-label="Combat records" class="fight-codex">
      {store.combat && <p>XP earned this session: {store.combat.rewards.xp}</p>}
      {store.combat && (
        <label>
          Combat difficulty{" "}
          <select
            aria-label="Combat difficulty"
            value={store.combat.difficulty}
            onChange={(e) => store.combat?.setDifficulty(e.currentTarget.value as "story" | "normal" | "expert")}
          >
            <option value="story">Story</option>
            <option value="normal">Normal</option>
            <option value="expert">Expert</option>
          </select>
        </label>
      )}
      {map && (
        <section aria-label={`${map.name} cleared body map`}>
          <h3>Body map: {map.name}</h3>
          <p>Rows follow statements; columns show nesting. ◆ Joint · ■ Body · ⚙ Organ · ⬟ Armor · ♥ Heart</p>
          <ul
            class="codex-body-map"
            aria-label="Cleared cells"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(...map.cells.map((c) => c[1])) + 1}, 32px)`,
            }}
          >
            {map.cells.map(([row, col, kind], i) => (
              <li
                key={i}
                aria-label={`${kind}, row ${row + 1}, depth ${col}`}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
              >
                {ICONS[kind]}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details>
        <summary>Bestiary · {Object.keys(store.codex.data.bestiary).length} tamed</summary>
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportBestiary(store.facts.world.kingdom.name, store.codex)], { type: "text/markdown" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "codebase-quest-bestiary.md";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export Bestiary
        </button>
        {Object.entries(store.codex.data.bestiary).map(([id, e]) => (
          <article key={id}>
            <h3>{e.name}</h3>
            <p>
              <code>
                {e.path}:{e.lines[0]}–{e.lines[1]}
              </code>
            </p>
            <p>
              {e.message}
              {e.measured !== null ? ` (measured ${e.measured}; threshold ${e.threshold ?? "n/a"})` : ""}
            </p>
            <p>How to fix it: {e.fix}</p>
            <label>
              Investigation notes{" "}
              <textarea
                aria-label={`Notes for ${e.name}`}
                maxLength={2000}
                defaultValue={e.note}
                onInput={(event) => store.codex.setBestiaryNote(id, event.currentTarget.value)}
              />
            </label>
          </article>
        ))}
      </details>
    </section>
  );
}
