import {
  type CellKind,
  type CodeBody,
  checkAction,
  costOf,
  currentPhase,
  inputById,
  isExposed,
  monsterHp,
  type PlayerAction,
  predictionChoices,
  questionById,
  questionFor,
} from "@codebase-quest/combat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CombatController } from "./controller.ts";
import "./combat.css";

const ICONS: Record<CellKind, string> = { joint: "◆", body: "■", organ: "⚙", armor: "⬟", heart: "♥" };
const KIND_NAMES: Record<CellKind, string> = {
  joint: "Joint",
  body: "Body",
  organ: "Organ",
  armor: "Armor",
  heart: "Heart",
};
const LABELS: Record<string, string> = {
  read: "Read",
  trace: "Trace Strike",
  sever: "Sever",
  disable: "Disable Organ",
  armor: "Break Armor",
  pierce: "Pierce Heart",
  gitling: "Ask Gitling",
  potion: "Hint Potion",
  tonic: "Energy Tonic",
  smoke: "Smoke Bomb",
  recall: "Scroll of Recall",
  compare: "Compare Twins",
  hunt: "Mutant Hunt",
  prove: "Who Calls?",
  investigate: "Investigate",
  classify: "Classify TODO",
  name: "Name It",
  match: "Match Voices",
  maze: "Walk the Maze",
  shape: "Name the Shape",
  reach: "Light the Branch",
  flee: "Flee",
};
const BASE: PlayerAction[] = ["read", "trace", "sever", "disable", "armor", "pierce", "gitling", "potion"];

function useController(c: CombatController) {
  const [, tick] = useState(0);
  useEffect(() => c.subscribe(() => tick((t) => t + 1)), [c]);
}
/** The fight, over the world. Keyboard: arrows move, Enter selects, 1–9 act/answer, E ends the turn. */
export function CombatPanel({
  controller,
  tileset,
  afterword,
  recall,
}: {
  controller: CombatController;
  tileset: string;
  afterword?: (symbolId: string) => string | null;
  recall?: (symbolId: string) => import("preact").ComponentChildren;
}) {
  useController(controller);
  const state = controller.state;
  const [selected, setSelected] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [announce, setAnnounce] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const questionBox = useRef<HTMLElement>(null);
  const encounterId = state?.encounter.id;
  useEffect(() => {
    if (!encounterId) return;
    setSelected(state?.encounter.bodies[0]?.cells[0]?.id ?? null);
    dialog.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [encounterId]);
  const pending = state?.pending ?? null;
  useEffect(() => {
    if (!state) return;
    if (pending?.kind === "question") {
      const q = questionById(state.encounter, pending.questionId);
      setAnnounce(`Question: ${q.prompt}`);
      questionBox.current?.focus();
    } else if (pending?.kind === "prediction") {
      const input = inputById(state.encounter, pending.inputId);
      setAnnounce(`Monster turn. Incoming: ${input.telegraph}. Which heart will it leave through?`);
      questionBox.current?.focus();
    }
  }, [pending?.kind, pending && ("questionId" in pending ? pending.questionId : pending.inputId)]);
  const execution = state?.lastExecution ?? null;
  useEffect(() => {
    if (!execution || skip || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setToken(null);
      return;
    }
    let step = 0;
    setToken(execution.pathCellIds[0] ?? null);
    const timer = setInterval(() => {
      step++;
      if (step >= execution.pathCellIds.length) {
        clearInterval(timer);
        setToken(null);
      } else setToken(execution.pathCellIds[step] ?? null);
    }, state?.balance.tokenStepMs ?? 350);
    return () => clearInterval(timer);
  }, [execution, skip]);
  const actions: PlayerAction[] = state
    ? [...BASE, ...(state.encounter.twist.actions as PlayerAction[]), "tonic", "recall", "smoke", "flee"]
    : [];
  const targetFor = (action: PlayerAction) => {
    if (
      !state ||
      [
        "flee",
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
        "tonic",
        "recall",
        "smoke",
      ].includes(action)
    )
      return null;
    if (
      action === "trace" &&
      selected &&
      state.encounter.bodies.flatMap((b) => b.cells).find((c) => c.id === selected)?.kind !== "heart" &&
      questionFor(state, action, selected)?.type !== "fill-gap"
    )
      return null;
    return selected;
  };
  const tryAct = (action: PlayerAction) => {
    if (!state) return;
    const cell = targetFor(action);
    const check = checkAction(state, action, cell);
    if (!check.ok) {
      setAnnounce(check.reason ?? "Not possible.");
      return;
    }
    controller.act(
      action,
      [
        "flee",
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
      ].includes(action)
        ? null
        : cell,
    );
  };
  useLayoutEffect(() => {
    if (!state) return;
    const handle = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
      if (event.key === "Tab" && dialog.current) {
        const focusable = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input, select, textarea, [tabindex='0']",
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog.current.querySelector("h2"))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (state.outcome) {
        if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) controller.close();
        return;
      }
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9) {
        event.preventDefault();
        if (pending?.kind === "question") {
          const q = questionById(state.encounter, pending.questionId);
          if (digit <= q.choices.length && !pending.removed.includes(digit - 1)) controller.answer(digit - 1);
        } else if (pending?.kind === "prediction") {
          const heart = predictionChoices(state)[digit - 1];
          if (heart) controller.predict(heart);
        } else {
          const action = actions[digit - 1];
          if (action) tryAct(action);
        }
      } else if (event.key === "0" && !pending) {
        event.preventDefault();
        tryAct("flee");
      } else if ((event.key === "e" || event.key === "E") && !pending) {
        event.preventDefault();
        controller.endTurn();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setAnnounce("To leave the fight, use Flee (0).");
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  if (!state) return null;
  const view = controller.view();
  const encounter = state.encounter;
  const firstBody = encounter.bodies[0];
  if (!firstBody) return null;
  const epilogue = state.outcome ? afterword?.(firstBody.symbolId) : null;
  const rules = state.balance.difficulties[state.difficulty];
  const bodies: CodeBody[] = [...encounter.bodies, ...encounter.minions.filter((m) => state.summoned.includes(m.id))];
  const all = bodies.flatMap((b) => b.cells);
  const cell = all.find((c) => c.id === selected);
  const hp = monsterHp(state);
  const phase = currentPhase(state);
  const q = pending?.kind === "question" ? questionById(encounter, pending.questionId) : null;
  const input = pending?.kind === "prediction" ? inputById(encounter, pending.inputId) : null;
  const frame = encounter.spriteFrame;
  const move = (event: KeyboardEvent, body: CodeBody, id: string) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const here = body.cells.find((c) => c.id === id);
    if (!here) return;
    const dx = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const dy = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const next = body.cells
      .filter((c) => (dx ? c.row === here.row && (c.col - here.col) * dx > 0 : (c.row - here.row) * dy > 0))
      .sort((a, b) =>
        dx
          ? Math.abs(a.col - here.col) - Math.abs(b.col - here.col)
          : Math.abs(a.row - here.row) - Math.abs(b.row - here.row) ||
            Math.abs(a.col - here.col) - Math.abs(b.col - here.col),
      )[0];
    if (next) {
      setSelected(next.id);
      document.getElementById(`cell-${next.id}`)?.focus();
    }
  };
  const cellText = (id: string) => {
    const c = all.find((x) => x.id === id);
    const s = state.cells[id];
    if (!c || !s) return id;
    const shown = s.revealed || state.outcome === "victory";
    const kind = rules.showKindIcons || shown ? KIND_NAMES[c.kind] : "Unknown";
    const extra = [
      c.kind === "heart" ? (isExposed(state, c.id) ? "exposed" : "guarded") : "",
      c.corrupted || state.spread.includes(c.id) ? "corrupted" : "",
      c.todo ? "TODO" : "",
      c.sparkle ? `sparkling ${c.sparkle}` : "",
      c.twinDiff && state.twistResolved ? "differs from its twin" : "",
    ].filter(Boolean);
    return `${kind}, L${c.lines[0]}, line ${c.lines[0]}, ${s.destroyed ? "destroyed" : shown ? c.label : "hidden"}${extra.length ? `, ${extra.join(", ")}` : ""}`;
  };
  return (
    <div class="combat-backdrop">
      <div
        id="combat"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="combat-title"
        data-encounter={encounter.id}
      >
        <header class="combat-head">
          <span
            class="monster-sprite"
            aria-hidden="true"
            style={{
              backgroundImage: `url(${tileset})`,
              backgroundPosition: `${-(frame % 12) * 16 * 4}px ${-Math.floor(frame / 12) * 16 * 4}px`,
            }}
          />
          <div>
            <p class="eyebrow">
              LEVEL {encounter.level} · {encounter.species.toUpperCase()}
            </p>
            <h2 id="combat-title" tabIndex={-1}>
              {encounter.name}
            </h2>
            <p class="twist">{encounter.twist.text}</p>
          </div>
        </header>
        <section class="meters" aria-label="Combat meters">
          <label>
            Focus {state.focus}/{state.maxFocus}
            <meter min={0} max={state.maxFocus} value={state.focus} />
          </label>
          <label>
            Energy {state.energy}/{Math.max(state.energy, state.balance.energyPerTurn)}
            <meter min={0} max={Math.max(state.energy, state.balance.energyPerTurn)} value={state.energy} />
          </label>
          <label>
            Monster {hp.hp}/{hp.max}
            <meter min={0} max={hp.max} value={hp.hp} />
          </label>
          <p>
            Turn <strong>{state.turn}</strong> · {phase?.name ?? "Phase 1"} · Potions {state.potions} ·{" "}
            {state.difficulty}
          </p>
        </section>
        <div class="combat-layout">
          <section class="body-panel" aria-label="Body map">
            <p class="legend" aria-hidden="true">
              ◆ Joint · ■ Body · ⚙ Organ · ⬟ Armor · ♥ Heart
            </p>
            <div class={encounter.kind === "mimic" ? "bodies twins" : "bodies"}>
              {bodies.map((body) => (
                <section key={body.id} aria-label={`${body.name} body`}>
                  <h3>
                    {body.name}{" "}
                    <span class="muted">{encounter.minions.includes(body as never) ? "(minion)" : body.path}</span>
                  </h3>
                  <div
                    class="body-grid"
                    style={{ gridTemplateColumns: `repeat(${Math.max(...body.cells.map((c) => c.col)) + 1}, 52px)` }}
                  >
                    {body.cells.map((c) => {
                      const s = state.cells[c.id];
                      const shown = s?.revealed || state.outcome === "victory";
                      const known = rules.showKindIcons || shown;
                      const classes = [
                        "cell",
                        known ? c.kind : "unknown",
                        s?.destroyed ? "destroyed" : "",
                        selected === c.id ? "selected" : "",
                        token === c.id ? "token" : "",
                        encounter.kind === "wisp" ? "flicker" : "",
                        encounter.kind === "shapeshifter" && !state.twistResolved ? "shifting" : "",
                        c.corrupted || state.spread.includes(c.id) ? "corrupted" : "",
                        c.dark && !shown ? "dark" : "",
                        c.sparkle ? "sparkle" : "",
                        c.todo ? "todo" : "",
                        c.kind === "heart" && isExposed(state, c.id) && !s?.destroyed ? "exposed" : "",
                      ];
                      return (
                        <button
                          type="button"
                          key={c.id}
                          id={`cell-${c.id}`}
                          data-cell={c.id}
                          class={classes.filter(Boolean).join(" ")}
                          style={{ gridRow: c.row + 1, gridColumn: c.col + 1 }}
                          tabIndex={
                            selected === c.id ||
                            (!body.cells.some((x) => x.id === selected) && c.id === body.cells[0]?.id)
                              ? 0
                              : -1
                          }
                          aria-pressed={selected === c.id}
                          aria-label={cellText(c.id)}
                          onFocus={() => setSelected(c.id)}
                          onClick={() => setSelected(c.id)}
                          onKeyDown={(e) => move(e, body, c.id)}
                        >
                          <span aria-hidden="true">
                            {s?.destroyed ? "×" : known ? (c.grouped ? "▤" : ICONS[c.kind]) : "?"}
                          </span>
                          <small aria-hidden="true">L{c.lines[0]}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p class="selection" aria-live="polite">
              {cell ? `Selected: ${cellText(cell.id)}` : "Select a cell"}
            </p>
          </section>
          <section class="combat-code" aria-label="Revealed code">
            {bodies.map((body) => (
              <div key={body.id}>
                <h3>{body.path}</h3>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable code must be reachable by keyboard (axe). */}
                <pre tabIndex={0}>
                  {body.code.lines.map((line, i) => {
                    const no = body.code.startLine + i;
                    const visible =
                      state.outcome === "victory" ||
                      body.cells.some((c) => state.cells[c.id]?.revealed && no >= c.lines[0] && no <= c.lines[1]);
                    const here = cell && no >= cell.lines[0] && no <= cell.lines[1];
                    return (
                      <div key={no} class={here ? "code-selected" : ""}>
                        <span class="line-no" aria-hidden="true">
                          {no}
                        </span>
                        <code>{visible ? line : "··· hidden ···"}</code>
                      </div>
                    );
                  })}
                </pre>
              </div>
            ))}
          </section>
        </div>
        {(q || input) && !state.outcome && (
          <section class="question" ref={questionBox} tabIndex={-1} aria-labelledby="question-title">
            <p class="eyebrow">
              {q ? (q.scored ? "YOUR MOVE" : "YOUR OPINION (NO RIGHT ANSWER)") : "INCOMING / FREE REACTION"}
            </p>
            <h3 id="question-title">
              {q?.prompt ?? `Incoming: ${input?.telegraph}. Which heart does it leave through?`}
            </h3>
            <div class="choices">
              {q
                ? q.choices.map((choice, i) =>
                    pending?.kind === "question" && pending.removed.includes(i) ? null : (
                      <button type="button" key={choice} onClick={() => controller.answer(i)}>
                        {i + 1}. {choice}
                      </button>
                    ),
                  )
                : predictionChoices(state).map((id, i) => {
                    const heart = all.find((c) => c.id === id);
                    return (
                      <button type="button" key={id} onClick={() => controller.predict(id)}>
                        {i + 1}. Heart at line {heart?.lines[0]}
                        {state.cells[id]?.revealed ? `: ${heart?.label}` : ""}
                      </button>
                    );
                  })}
            </div>
            {q &&
              pending?.kind === "question" &&
              state.potions > 0 &&
              q.answer !== null &&
              q.choices.length - pending.removed.length > 2 && (
                <button type="button" class="potion" onClick={() => controller.act("potion", null)}>
                  Use a Hint Potion (remove two wrong choices) · {state.potions} left
                </button>
              )}
          </section>
        )}
        {state.recalled && (
          <section aria-label="Recalled Codex page">
            <h3>Codex · {firstBody.name}</h3>
            {recall?.(firstBody.symbolId) ?? <p>No earlier map recorded for this symbol.</p>}
          </section>
        )}
        {!state.outcome && (
          <section class="actions" aria-label="Action bar">
            {actions.map((action, i) => {
              const target = targetFor(action);
              const check = checkAction(state, action, target);
              return (
                <button
                  type="button"
                  key={action}
                  data-action={action}
                  disabled={!check.ok}
                  title={check.reason}
                  onClick={() => tryAct(action)}
                >
                  {(action === "flee" || i < 9) && <kbd>{action === "flee" ? 0 : i + 1}</kbd>}{" "}
                  {LABELS[action] ?? action} <small>{costOf(state, action)} E</small>
                </button>
              );
            })}
            <button type="button" class="primary" disabled={Boolean(pending)} onClick={() => controller.endTurn()}>
              <kbd>E</kbd> End turn
            </button>
            <label class="skip">
              <input
                type="checkbox"
                checked={skip}
                onChange={(e) => setSkip((e.currentTarget as HTMLInputElement).checked)}
              />{" "}
              Skip token animation
            </label>
          </section>
        )}
        {state.outcome && (
          <section class="outcome" role="status">
            <h3>
              {state.outcome === "victory"
                ? "Victory! The monster is tamed and its body is a map in your Codex."
                : state.outcome === "tamed"
                  ? "Report noted. The monster drifts away, calm."
                  : state.outcome === "defeat"
                    ? "Defeat. You return to the region's gate to think it over."
                    : "You fled safely. Return within 60 seconds to keep its wounds."}
            </h3>
            <p>
              {state.stats.reads} reads · {state.stats.answersRight} correct answers · {state.stats.predictionsRight}{" "}
              blocks
              {(state.outcome === "victory" || state.outcome === "tamed") &&
                ` · ${state.xp + 10} XP and a Hint Potion earned`}
              {view?.outcome === "victory" ? ` · understood: ${state.understood.length} symbol(s)` : ""}
            </p>
            <p class="muted">How to fix it in real life: {encounter.bestiary.fix}</p>
            {epilogue && <p>{epilogue}</p>}
            <button type="button" class="primary" onClick={() => controller.close()}>
              Return to the world
            </button>
          </section>
        )}
        <section class="combat-log" aria-label="Combat log">
          {state.log.slice(-4).map((entry, i) => (
            <p key={`${state.log.length - i}-${entry.text}`} class={entry.tone}>
              {entry.text}
            </p>
          ))}
        </section>
        <p class="visually-hidden" aria-live="assertive">
          {announce}
        </p>
        <p class="visually-hidden" aria-live="polite">
          {state.log.at(-1)?.text}
        </p>
        <p class="hint-keys" aria-hidden="true">
          Arrows: move · 1–9: actions/answers · 0: flee · E: end turn
        </p>
      </div>
    </div>
  );
}
