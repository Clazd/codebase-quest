import { render } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { createArtStage } from "./artStage.ts";
import { MONSTERS, monsterById } from "./bodies/index.ts";
import balanceJson from "./combat/balance.json" with { type: "json" };
import {
  ACTIONS,
  act,
  answer,
  type Balance,
  type CombatState,
  checkAction,
  createCombat,
  currentPhase,
  type Difficulty,
  endTurn,
  inputById,
  isExposed,
  type PlayerAction,
  predict,
  predictionChoices,
  questionById,
} from "./combat/engine.ts";
import { FleeMemory } from "./combat/fleeMemory.ts";
import type { Body, CellKind } from "./combat/schema.ts";
import "./prototype.css";

const balance = balanceJson as Balance;
const memory = new FleeMemory();
const icons: Record<CellKind, string> = { joint: "◆", body: "■", organ: "⚙", armor: "⬟", heart: "♥" };
const labels: Record<PlayerAction, string> = {
  read: "Read",
  trace: "Trace Strike",
  sever: "Sever",
  disable: "Disable Organ",
  armor: "Break Armor",
  pierce: "Pierce Heart",
  compare: "Compare Twins",
  gitling: "Ask Gitling",
  flee: "Flee",
};

function App() {
  const [monsterId, setMonsterId] = useState("serpent");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [state, setState] = useState(() => createCombat(monsterById("serpent"), balance, "normal"));
  const [selected, setSelected] = useState("c1");
  const [token, setToken] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [skip, setSkip] = useState(false);
  const [onboarding, setOnboarding] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const questionBox = useRef<HTMLElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const pending = state.pending;
  const question = pending?.kind === "question" ? questionById(state.monster, pending.questionId) : null;
  const input = pending?.kind === "prediction" ? inputById(state.monster, pending.inputId) : null;
  const activeBodies = [...state.monster.bodies, ...state.monster.minions.filter((b) => state.summoned.includes(b.id))];
  const cell = activeBodies.flatMap((b) => b.cells).find((c) => c.id === selected);

  function update(next: CombatState) {
    if (next.outcome === "fled") memory.remember(next);
    setState(next);
  }
  function start(id = monsterId, mode = difficulty) {
    setMonsterId(id);
    setDifficulty(mode);
    const next = memory.resume(createCombat(monsterById(id), balance, mode));
    update(next);
    setSelected(next.monster.bodies[0]?.cells[0]?.id ?? "");
    setToken(null);
    setAnimating(false);
  }
  function choose(action: PlayerAction) {
    if (!animating && checkAction(state, action, selected).ok) update(act(state, action, selected));
  }
  useEffect(() => {
    if (!stage.current) return;
    const art = createArtStage(stage.current, false, state.monster.spriteFrame);
    return () => art.destroy();
  }, [state.monster.spriteFrame]);
  useEffect(() => {
    if (pending) questionBox.current?.focus();
    else if (document.activeElement?.closest(".question")) endButton.current?.focus();
  }, [pending]);
  useEffect(() => {
    const execution = state.lastExecution;
    if (!execution || skip || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setToken(null);
      setAnimating(false);
      return;
    }
    let step = 0;
    setAnimating(true);
    setToken(execution.pathCellIds[0] ?? null);
    const timer = setInterval(() => {
      step++;
      if (step >= execution.pathCellIds.length) {
        clearInterval(timer);
        setToken(null);
        setAnimating(false);
      } else setToken(execution.pathCellIds[step] ?? null);
    }, state.balance.tokenStepMs);
    return () => clearInterval(timer);
  }, [state.lastExecution, skip, state.balance.tokenStepMs]);
  useLayoutEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLInputElement
      )
        return;
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9 && !animating && !state.outcome) {
        if (question && digit <= question.choices.length) {
          event.preventDefault();
          update(answer(state, digit - 1));
        } else if (input) {
          const heart = predictionChoices(state)[digit - 1];
          if (heart) {
            event.preventDefault();
            update(predict(state, heart));
          }
        } else {
          const action = ACTIONS[digit - 1];
          if (action) {
            event.preventDefault();
            choose(action);
          }
        }
      }
      if (event.key.toLowerCase() === "e" && !pending && !animating && !state.outcome) {
        event.preventDefault();
        update(endTurn(state));
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  function move(event: KeyboardEvent, body: Body, id: string) {
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
  }
  const phase = currentPhase(state);
  return (
    <main>
      <nav>
        <a href="/">CODEBASE QUEST</a>
        <a href="/prototype/art/">Art study ↗</a>
      </nav>
      <header>
        <div>
          <p class="eyebrow">PHASE 01 / COMBAT LAB</p>
          <h1>
            Know the code.
            <br />
            <span>Break the monster.</span>
          </h1>
          <p>A tiny battle about understanding real functions.</p>
        </div>
        <div ref={stage} class="monster-stage" aria-hidden="true" />
      </header>
      <section class="setup" aria-label="Fight setup">
        <label>
          Encounter{" "}
          <select value={monsterId} onChange={(e) => start(e.currentTarget.value)}>
            {MONSTERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty{" "}
          <select value={difficulty} onChange={(e) => start(monsterId, e.currentTarget.value as Difficulty)}>
            <option value="story">Story · revealed</option>
            <option value="normal">Normal</option>
            <option value="expert">Expert · hidden kinds</option>
          </select>
        </label>
        <button type="button" onClick={() => start()}>
          Restart encounter
        </button>
      </section>
      {onboarding && (
        <aside class="onboarding">
          <strong>Your enemy is a real function.</strong> Rows follow statements; columns show nesting. Select a cell,
          then act. Sever joints to cut whole limbs; expose and pierce every heart to win.{" "}
          <button type="button" onClick={() => setOnboarding(false)}>
            Got it
          </button>
        </aside>
      )}
      <section class="meters" aria-label="Combat meters">
        <label>
          Focus {state.focus}/{state.maxFocus}
          <meter min={0} max={state.maxFocus} value={state.focus} />
        </label>
        <label>
          Energy {state.energy}/{balance.energyPerTurn}
          <meter min={0} max={balance.energyPerTurn} value={state.energy} />
        </label>
        <div>
          TURN <strong>{state.turn}</strong>
          <br />
          {phase?.name ?? "Phase 1"}
        </div>
      </section>
      <div class="battle-layout">
        <section class="body-panel">
          <p class="eyebrow">THE BODY MAP</p>
          <h2>{state.monster.name}</h2>
          <p>{state.monster.smell}</p>
          <p class="legend">◆ Joint · ■ Body · ⚙ Organ · ⬟ Armor · ♥ Heart</p>
          <div class={state.monster.twist === "mimic" ? "bodies twins" : "bodies"}>
            {activeBodies.map((body) => (
              <section key={body.id} aria-label={`${body.name} body`}>
                <h3>{body.name}</h3>
                <div
                  class="body-grid"
                  style={{ gridTemplateColumns: `repeat(${Math.max(...body.cells.map((c) => c.col)) + 1}, 58px)` }}
                >
                  {body.cells.map((c) => {
                    const status = state.cells[c.id];
                    const shown = status?.revealed || state.outcome === "victory";
                    const kind = balance.difficulties[difficulty].showKindIcons || shown ? c.kind : "unknown";
                    return (
                      <button
                        type="button"
                        key={c.id}
                        id={`cell-${c.id}`}
                        data-cell={c.id}
                        class={`cell ${c.kind} ${status?.destroyed ? "destroyed" : ""} ${selected === c.id ? "selected" : ""} ${token === c.id ? "token" : ""}`}
                        style={{ gridRow: c.row + 1, gridColumn: c.col + 1 }}
                        tabIndex={
                          selected === c.id ||
                          (!body.cells.some((c) => c.id === selected) && c.id === body.cells[0]?.id)
                            ? 0
                            : -1
                        }
                        aria-pressed={selected === c.id}
                        aria-label={`L${c.lines[0]}, ${kind}, line ${c.lines[0]}, ${status?.destroyed ? "destroyed" : shown ? c.label : "hidden"}`}
                        onFocus={() => setSelected(c.id)}
                        onClick={() => setSelected(c.id)}
                        onKeyDown={(e) => move(e, body, c.id)}
                      >
                        <span aria-hidden="true">
                          {status?.destroyed ? "×" : kind === "unknown" ? "?" : icons[c.kind]}
                        </span>
                        <small>L{c.lines[0]}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <p class="selection">
            {cell
              ? `Selected: ${cell.id} · line ${cell.lines[0]}${cell.kind === "heart" ? (isExposed(state, cell.id) ? " · exposed" : " · guarded") : ""}`
              : "Select a cell"}
          </p>
        </section>
        <section class="code-panel" aria-label="Revealed code">
          <p class="eyebrow">CODE PANEL</p>
          <h2>Read what you reveal.</h2>
          {activeBodies.map((body) => (
            <div key={body.id}>
              <h3>{body.source.replace("fixtures/repos/tiny-ts/", "")}</h3>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal code scrolling must be keyboard-accessible (axe scrollable-region-focusable). */}
              <pre tabIndex={0}>
                {body.code.lines.map((line, index) => {
                  const lineNo = body.code.startLine + index;
                  const visible =
                    state.outcome === "victory" ||
                    body.cells.some((c) => state.cells[c.id]?.revealed && lineNo >= c.lines[0] && lineNo <= c.lines[1]);
                  return (
                    <div
                      key={lineNo}
                      class={cell && lineNo >= cell.lines[0] && lineNo <= cell.lines[1] ? "code-selected" : ""}
                    >
                      <span class="line-no">{lineNo}</span>
                      <code>{visible ? line : "··· hidden ···"}</code>
                    </div>
                  );
                })}
              </pre>
            </div>
          ))}
        </section>
      </div>
      {pending && (
        <section class="question" ref={questionBox} tabIndex={-1} aria-labelledby="question-title">
          <p class="eyebrow">{question ? "YOUR MOVE" : "INCOMING / FREE REACTION"}</p>
          <h2 id="question-title">{question?.prompt ?? `Incoming: ${input?.telegraph}. Which heart does it exit?`}</h2>
          <div class="choices">
            {question
              ? question.choices.map((choice, i) => (
                  <button type="button" key={choice} onClick={() => update(answer(state, i))}>
                    {i + 1}. {choice}
                  </button>
                ))
              : predictionChoices(state).map((id, i) => {
                  const heart = state.monster.bodies.flatMap((b) => b.cells).find((c) => c.id === id);
                  return (
                    <button type="button" key={id} onClick={() => update(predict(state, id))}>
                      {i + 1}. Heart {id} · line {heart?.lines[0]}
                    </button>
                  );
                })}
          </div>
        </section>
      )}
      <section class="actions" aria-label="Action bar">
        {ACTIONS.map((action, i) => {
          const check = checkAction(state, action, selected);
          return (
            <button
              type="button"
              key={action}
              disabled={!check.ok || animating}
              title={check.reason}
              onClick={() => choose(action)}
            >
              <kbd>{i + 1}</kbd> {labels[action]} <small>{check.cost} E</small>
            </button>
          );
        })}
        <button
          type="button"
          class="primary"
          ref={endButton}
          disabled={!!pending || !!state.outcome || animating}
          onClick={() => update(endTurn(state))}
        >
          <kbd>E</kbd> End turn
        </button>
      </section>
      <div class="animation-controls">
        <label>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.currentTarget.checked)} /> Skip token
          animation
        </label>
        {animating && (
          <button
            type="button"
            onClick={() => {
              setSkip(true);
              setToken(null);
              setAnimating(false);
            }}
          >
            Skip animation now
          </button>
        )}
        <span>Arrows: move · Enter: select · 1–8: actions / answers · E: end turn</span>
      </div>
      {state.outcome && (
        <section class="outcome" role="status">
          <p class="eyebrow">ENCOUNTER COMPLETE</p>
          <h2>
            {state.outcome === "victory"
              ? "Victory — the code is your map."
              : state.outcome === "defeat"
                ? "Defeat — take another look."
                : "You fled safely."}
          </h2>
          <p>
            {state.outcome === "fled"
              ? "Return within 60 seconds to keep the monster's wounds."
              : `${state.stats.reads} reads · ${state.stats.answersRight} correct answers · ${state.stats.predictionsRight} blocks`}
          </p>
          <button type="button" onClick={() => start()}>
            Fight again
          </button>
        </section>
      )}
      <section class="combat-log" aria-label="Combat log" aria-live="polite">
        <h2>Battle notes</h2>
        {state.log.slice(-5).map((entry, i) => (
          <p key={`${state.log.length - i}-${entry.text}`} class={entry.tone}>
            {entry.text}
          </p>
        ))}
      </section>
      <footer>Local prototype · hand-authored Taskly facts · no analyzed code is executed.</footer>
    </main>
  );
}
const root = document.getElementById("app");
if (root) render(<App />, root);
