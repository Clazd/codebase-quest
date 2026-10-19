import type { Objective } from "@codebase-quest/quests";
import { ACHIEVEMENTS, BRANCHES, EQUIPMENT, objectiveTotal, SHOP, SKILLS, stars } from "@codebase-quest/quests";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Progression } from "./controller.ts";
import "./progression.css";

export function download(text: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ObjectiveAction({ p, o }: { p: Progression; o: Objective }) {
  const [choice, setChoice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attempted, setAttempted] = useState(false);
  const act = () => {
    p.changed();
    p.persist();
  };
  if (o.kind === "welcome")
    return (
      <div>
        {o.step === "readme" && (
          <>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable source text must be keyboard reachable. */}
            <section class="welcome-scroll" tabIndex={0} aria-label="Welcome scroll">
              <pre>{p.atlas.readme}</pre>
            </section>
            <button
              type="button"
              onClick={() => {
                p.event({ kind: "welcome", step: "readme" });
                const file = p.atlas.files.find((f) => /(^|\/)readme\.md$/i.test(f.path));
                if (file) p.event({ kind: "doc", fileId: file.id });
                act();
              }}
            >
              I read the welcome scroll
            </button>
          </>
        )}
        {o.step === "gitling" && (
          <>
            <p>
              Gitling: “Follow the next objective. I can help you find code and its callers; scored answers come from
              the code itself.”
            </p>
            <button
              type="button"
              onClick={() => {
                p.event({ kind: "welcome", step: "gitling" });
                act();
              }}
            >
              Meet Gitling
            </button>
          </>
        )}
        {o.step === "gate" && <p>Enter the kingdom through the title screen.</p>}
      </div>
    );
  if (o.kind === "answer") {
    const s = p.atlas.symbols.find((s) => s.id === o.symbolId);
    if (!s) return null;
    const read = ["read", "understood", "mastered"].includes(p.engine.save.comprehension[s.id] ?? "");
    const tracing = s.callOrder.length > 0;
    const syntaxKind = !tracing && !["function", "method"].includes(s.kind);
    const expected = tracing ? (s.callOrder[0] ?? "") : syntaxKind ? s.kind : String(s.parameters);
    const options = syntaxKind
      ? ["function", "method", "class", "interface", "type"].map((kind) => ({ value: kind, label: kind }))
      : tracing
        ? p.atlas.symbols
            .filter((n) => n.id === expected || !s.callOrder.includes(n.id))
            .slice(0, 5)
            .map((n) => ({ value: n.id, label: `${n.name} · ${p.atlas.files.find((f) => f.id === n.fileId)?.path}` }))
        : [...new Set([0, 1, 2, 3, s.parameters])]
            .sort((a, b) => a - b)
            .map((n) => ({ value: String(n), label: String(n) }));
    if (tracing && !options.some((o) => o.value === expected)) {
      const target = p.atlas.symbols.find((n) => n.id === expected);
      if (target)
        options.push({
          value: expected,
          label: `${target.name} · ${p.atlas.files.find((f) => f.id === target.fileId)?.path}`,
        });
    }
    options.sort((a, b) => a.label.localeCompare(b.label));
    return (
      <div class="signature-question">
        <p>
          {tracing
            ? `Which resolved function call appears first in the source of ${s.name}? Follow exact calls; external and uncertain calls are excluded.`
            : syntaxKind
              ? `What kind of declaration defines ${s.name}? Inspect its source in the Code Panel first.`
              : `How many declared parameters does ${s.name} have? Inspect its signature in the Code Panel first.`}
        </p>
        <label>
          {tracing ? "First exact call " : syntaxKind ? "Declaration kind " : "Parameter count "}
          <select value={choice} disabled={!read} onChange={(e) => setChoice(e.currentTarget.value)}>
            <option value="">Choose…</option>
            {options.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!read || choice === ""}
          onClick={() => {
            if (choice === expected) {
              p.event({
                kind: "answer",
                symbolId: s.id,
                puzzleType: tracing ? "call-order" : "signature",
                evidence: `${tracing ? "call-order" : "signature"}:${s.hash}`,
                firstTry: !attempted,
              });
              act();
            } else {
              setAttempted(true);
              setFeedback(
                tracing
                  ? "Follow the call expressions in source order and check exact edges."
                  : "Look again at the named parameters in the function declaration.",
              );
            }
          }}
        >
          Check answer
        </button>
        <p role="status">{feedback || (!read ? "Talk to this resident first." : "")}</p>
      </div>
    );
  }
  if (o.kind === "find")
    return (
      <div>
        <label>
          Resident{" "}
          <select value={choice} onChange={(e) => setChoice(e.currentTarget.value)}>
            <option value="">Choose…</option>
            {p.atlas.symbols.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {p.atlas.files.find((f) => f.id === s.fileId)?.path}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!choice}
          onClick={() => {
            if (o.answerSymbolIds.includes(choice)) {
              p.event({ kind: "find", query: o.query, symbolId: choice });
              act();
            } else setFeedback("That name or documentation does not match the query.");
          }}
        >
          Submit finding
        </button>
        <p role="status">{feedback}</p>
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => {
        const target = p.target(o);
        p.close();
        if (o.kind === "talk") p.app.walkTo(o.symbolId);
        else if (target) p.app.message = `Follow the gold quest arrow: ${p.describe(o)}.`;
      }}
    >
      Guide me
    </button>
  );
}
function Quests({ p }: { p: Progression }) {
  const e = p.engine;
  return (
    <div class="quest-list">
      {["active", "available", "locked", "completed"].map((state) => (
        <section key={state}>
          <h3>
            {state[0]?.toUpperCase()}
            {state.slice(1)}
          </h3>
          {e.definitions
            .filter((q) => e.save.quests[q.id]?.state === state)
            .map((q) => {
              const progress = e.save.quests[q.id],
                next = e.next(q),
                objective = q.objectives[next];
              const text = (p.app.facts.content[`quest-narration:${q.id}`]?.output as { text?: string } | undefined)
                ?.text;
              return (
                <article key={q.id} data-quest={q.id}>
                  <h4>{q.title}</h4>
                  <p>{q.summary}</p>
                  <p>{typeof text === "string" && text.length <= 400 ? text : q.narration.intro}</p>
                  <p>
                    {q.rewards.xp} XP · {q.rewards.gold} gold
                    {q.rewards.keys.length ? ` · ${q.rewards.keys.length} Concept Keys` : ""}
                  </p>
                  <ol>
                    {q.objectives.map((o, i) => (
                      <li key={`${q.id}:${i}`} aria-current={i === next && state === "active" ? "step" : undefined}>
                        {(progress?.counts[i] ?? 0) >= objectiveTotal(o) ? "✓ " : "○ "}
                        {p.describe(o)}
                        {objectiveTotal(o) > 1 ? ` (${progress?.counts[i] ?? 0}/${objectiveTotal(o)})` : ""}
                      </li>
                    ))}
                  </ol>
                  {state === "available" && (
                    <button
                      type="button"
                      onClick={() => {
                        e.accept(q.id);
                        p.changed();
                        p.persist();
                      }}
                    >
                      Accept {q.title}
                    </button>
                  )}
                  {state === "locked" && <p>Requires {q.prerequisites.join(", ")}</p>}
                  {state === "active" && (
                    <>
                      {q.type !== "main" && (
                        <button
                          type="button"
                          onClick={() => {
                            e.setAside(q.id);
                            p.changed();
                            p.persist();
                          }}
                        >
                          Set aside {q.title}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-pressed={e.save.tracked === q.id}
                        onClick={() => {
                          e.track(q.id);
                          p.changed();
                        }}
                      >
                        Track {q.title}
                      </button>
                      {objective && <ObjectiveAction key={`${q.id}:${next}`} p={p} o={objective} />}
                    </>
                  )}
                </article>
              );
            })}
        </section>
      ))}
      <p>{p.atlas.finale}</p>
    </div>
  );
}
function Skills({ p }: { p: Progression }) {
  const s = p.engine.save;
  return (
    <>
      <p>{s.player.level - 1 - s.player.skills.length} skill points available · one per level gained</p>
      <div class="skill-branches">
        {BRANCHES.map((branch) => (
          <section key={branch}>
            <h3>{branch}</h3>
            {SKILLS.filter((s) => s.branch === branch).map((node) => (
              <button
                type="button"
                key={node.id}
                aria-pressed={s.player.skills.includes(node.id)}
                disabled={
                  s.player.skills.includes(node.id) ||
                  s.player.skills.length >= s.player.level - 1 ||
                  Boolean(node.prerequisite && !s.player.skills.includes(node.prerequisite))
                }
                onClick={() => {
                  p.engine.unlock(node.id);
                  p.changed();
                  p.persist();
                }}
              >
                {node.tier}. {node.title}
                {s.player.skills.includes(node.id) ? " ✓" : ""}
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
function Equipment({ p }: { p: Progression }) {
  const [id, setId] = useState(p.app.overlay.state.panel?.symbolId ?? p.atlas.symbols[0]?.id ?? "");
  const [step, setStep] = useState(0),
    [route, setRoute] = useState<"all" | "then" | "else">("all");
  const s = p.atlas.symbols.find((s) => s.id === id),
    view = p.equipmentView(id);
  if (!s || !view) return <p>No resident in this world.</p>;
  const file = p.atlas.files.find((f) => f.id === s.fileId);
  const unlocked = p.engine.save.equipment;
  const visibleSteps = view.steps.filter((line) => route === "all" || line.guards.every((guard) => guard === route));
  const selectStep = (n: number) => {
    const index = Math.max(0, Math.min(visibleSteps.length - 1, n));
    setStep(index);
    p.app.overlay.staticStepLine = visibleSteps[index]?.line ?? null;
  };
  return (
    <>
      <label>
        Equipment resident{" "}
        <select
          value={id}
          onChange={(e) => {
            setId(e.currentTarget.value);
            setStep(0);
          }}
        >
          {p.atlas.symbols.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {p.atlas.files.find((f) => f.id === s.fileId)?.path}
            </option>
          ))}
        </select>
      </label>
      <p>Unlock views in the skill tree. Select a resident to inspect the exact data behind each overlay.</p>
      {Object.entries(EQUIPMENT).map(([key, title]) => (
        <section key={key} data-equipment={key}>
          <h3>{title}</h3>
          {!unlocked.includes(key) ? (
            <p>Locked · {SKILLS.find((s) => s.effect === key)?.title}</p>
          ) : (
            <>
              {key === "compass" && (
                <>
                  <p>{view.callers.length} exact callers</p>
                  <ul>
                    {view.callers.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => {
                            p.close();
                            p.app.walkTo(id);
                          }}
                        >
                          {p.atlas.symbols.find((s) => s.id === id)?.name} ↗
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {key === "spyglass" && (
                <>
                  <code>{view.signature}</code>
                  <p>Declared return: {s.returnType ?? "not annotated"}</p>
                </>
              )}
              {key === "lantern" && (
                <>
                  <p>
                    {view.testedBy.length} exact test references · coverage:{" "}
                    {view.coverage === null ? "not measured" : `${Math.round(view.coverage * 100)}%`}
                  </p>
                  <ul>
                    {view.testedBy.map((id) => (
                      <li key={id}>{p.atlas.symbols.find((s) => s.id === id)?.name ?? id}</li>
                    ))}
                  </ul>
                  <p>Nearby Shadows are revealed; their smell attack is weakened while this view is equipped.</p>
                </>
              )}
              {key === "hourglass" && (
                <>
                  <p>Static syntax walk · no code is executed. Branch choices select a reading route.</p>
                  <label>
                    Branch route{" "}
                    <select
                      value={route}
                      onChange={(e) => {
                        setRoute(e.currentTarget.value as typeof route);
                        setStep(0);
                      }}
                    >
                      <option value="all">All statements</option>
                      <option value="then">Consequent</option>
                      <option value="else">Alternative</option>
                    </select>
                  </label>
                  {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable syntax listing must be keyboard reachable. */}
                  <ol class="static-steps" tabIndex={0} aria-label="Static syntax statements">
                    {visibleSteps.map((line, i) => (
                      <li
                        key={`${line.line}:${i}`}
                        aria-current={i === step ? "step" : undefined}
                        style={{ paddingLeft: `${line.depth * 12}px` }}
                      >
                        L{line.line}: <code>{line.text}</code>
                        {line.branch ? ` · choose ${line.branch}` : ""}
                      </li>
                    ))}
                  </ol>
                  <button type="button" onClick={() => selectStep(step - 1)}>
                    Previous statement
                  </button>
                  <button type="button" onClick={() => selectStep(step + 1)}>
                    Next statement
                  </button>
                </>
              )}
              {key === "boots" &&
                [...new Set([...view.imports, ...view.importers])].map((id) => {
                  const f = p.atlas.files.find((f) => f.id === id);
                  const destination = p.app.session.world.interiors.find(
                    (i) => i.buildingId === f?.buildingId,
                  )?.entrance;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!destination}
                      onClick={() => {
                        if (destination) {
                          p.close();
                          void p.app.go(destination).catch((e) => {
                            p.app.message = String(e);
                          });
                        }
                      }}
                    >
                      {view.imports.includes(id) ? "Imports" : "Imported by"} {f?.path}
                    </button>
                  );
                })}
              {key === "lens" && (
                <ul>
                  {view.dependencies.map((d) => (
                    <li key={`${d.from}:${d.to}`}>
                      {p.app.session.world.regions.find((r) => r.id === d.from)?.name} →{" "}
                      {p.app.session.world.regions.find((r) => r.id === d.to)?.name} · {d.weight} imports
                    </li>
                  ))}
                </ul>
              )}
              {key === "chronicle" && (
                <>
                  <p>{file?.path}</p>
                  <p>First recorded: {view.firstCommitAt ?? "unknown"}</p>
                  <p>Last changed: {view.lastCommitAt ?? "unknown"}</p>
                </>
              )}
            </>
          )}
        </section>
      ))}
      <section>
        <h3>Unlocked field notes</h3>
        {p.engine.save.player.skills.map((id) => {
          const n = SKILLS.find((s) => s.id === id);
          return (
            <p key={id}>
              {n?.title}:{" "}
              {p.skillNotes(n?.effect ?? "", s.id).join(" · ") || "No matching evidence in this repository."}
            </p>
          );
        })}
      </section>
    </>
  );
}
function profile(p: Progression) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = p.engine.save,
    light = p.engine.illumination;
  ctx.fillStyle = "#14252f";
  ctx.fillRect(0, 0, 960, 480);
  ctx.strokeStyle = "#ffdc87";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 920, 440);
  ctx.fillStyle = "#ffdc87";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(p.app.session.world.kingdom.name.slice(0, 45), 48, 100);
  ctx.fillStyle = "#f4edda";
  ctx.font = "28px sans-serif";
  [
    `Level ${s.player.level} · ${Math.round(light.kingdom)}% Light`,
    `${Object.keys(s.bestiary).length} monsters tamed`,
    `${Object.values(light.regions).filter((v) => stars(v) >= 2).length} regions with two mastery stars`,
    `${Object.keys(s.achievements).length} achievements · Codebase Quest`,
  ].forEach((line, i) => {
    ctx.fillText(line, 48, 180 + i * 65);
  });
  canvas.toBlob((blob) => {
    if (blob) download(blob, "codebase-quest-profile.png", "image/png");
  }, "image/png");
}
function DocScrolls({ p }: { p: Progression }) {
  const docs = p.app.facts.book.files.filter((f) => /\.(?:md|rst|txt)$/i.test(f.path));
  const [id, setId] = useState(docs[0]?.id ?? ""),
    [page, setPage] = useState(0),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const file = docs.find((f) => f.id === id),
    start = page * 80 + 1,
    end = Math.min(file?.loc ?? 0, (page + 1) * 80);
  useEffect(() => {
    if (!file || !end) return;
    let live = true;
    setText("");
    setError("");
    fetch(new URL(`source/${file.id}?start=${start}&end=${end}`, p.app.loader.url))
      .then(async (r) => {
        if (!r.ok) throw new Error("The scroll could not be read.");
        const data = (await r.json()) as { lines: string[]; stale: boolean };
        if (live) setText(data.lines.join("\n"));
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [p, file, start, end]);
  if (!docs.length) return <p>No documentation scrolls in this world.</p>;
  return (
    <section>
      <h3>Documentation scrolls</h3>
      <label>
        Scroll{" "}
        <select
          value={id}
          onChange={(e) => {
            setId(e.currentTarget.value);
            setPage(0);
          }}
        >
          {docs.map((f) => (
            <option key={f.id} value={f.id}>
              {p.engine.save.docs.includes(f.id) ? "✓ " : ""}
              {f.path}
            </option>
          ))}
        </select>
      </label>
      <p role="status">{error}</p>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable repository text must be keyboard reachable. */}
      <section class="welcome-scroll" tabIndex={0} aria-label="Documentation scroll">
        <pre>{text || "Loading scroll…"}</pre>
      </section>
      <p>
        Lines {start}–{end} of {file?.loc}
      </p>
      <button type="button" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
        Previous page
      </button>
      <button type="button" disabled={end === (file?.loc ?? 0)} onClick={() => setPage((n) => n + 1)}>
        Next page
      </button>
      <button
        type="button"
        disabled={!text || end !== (file?.loc ?? 0)}
        onClick={() => {
          if (file) {
            p.event({ kind: "doc", fileId: file.id });
            p.persist();
          }
        }}
      >
        Mark scroll read
      </button>
    </section>
  );
}
function Journal({ p }: { p: Progression }) {
  const s = p.engine.save;
  return (
    <>
      <h3>Kingdom Light: {p.engine.illumination.kingdom.toFixed(1)}%</h3>
      <p>
        Seen 10% · read 40% · understood 80% · mastered 100%, weighted by symbol lines. Three stars need a Guardian in
        Phase 09.
      </p>
      <ul>
        {Object.entries(p.engine.illumination.regions).map(([id, v]) => (
          <li key={id}>
            {p.app.session.world.regions.find((r) => r.id === id)?.name}: {v.toFixed(1)}% {"★".repeat(stars(v))}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => profile(p)}>
        Export profile PNG
      </button>
      <DocScrolls p={p} />
      <h3>Achievements</h3>
      <ul>
        {ACHIEVEMENTS.map(([id, title, desc]) => (
          <li key={id}>
            {s.achievements[id] ? "✓" : "○"} {title} — {desc}
          </li>
        ))}
      </ul>
      <h3>Archive</h3>
      {s.archive.length ? (
        s.archive.map((a) => (
          <p key={a.id}>
            {a.name} · {a.state} · {a.note}
          </p>
        ))
      ) : (
        <p>No archived residents.</p>
      )}
    </>
  );
}
function Saves({ p }: { p: Progression }) {
  const [error, setError] = useState("");
  return (
    <>
      <p>
        Autosaves every 30 seconds and when changing scenes. Export before changing browser or local server address.
      </p>
      <p role="status">{error || p.storage.error || "Local save ready."}</p>
      <button type="button" onClick={() => download(p.export(), "kingdom.cqsave", "application/json")}>
        Export .cqsave
      </button>
      <label>
        Import .cqsave{" "}
        <input
          type="file"
          accept=".cqsave,application/json"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            if (!f) return;
            try {
              await p.import(await f.text());
              setError("Save restored.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      {p.storage.backup && (
        <button
          type="button"
          onClick={() => download(p.storage.backup ?? "", "damaged-save.cqsave", "application/json")}
        >
          Download damaged save backup
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          await p.restart();
          setError("New game started. Previous save is retained in the storage backup.");
        }}
      >
        Start new game (keeps backup)
      </button>
      <h3>Settings</h3>
      <button
        type="button"
        onClick={async () => {
          try {
            await p.restorePrevious();
            setError("Previous game restored.");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Restore previous game backup
      </button>
      <label>
        <input
          type="checkbox"
          checked={p.engine.save.settings.reducedMotion}
          onChange={(e) => {
            p.engine.save.settings.reducedMotion = e.currentTarget.checked;
            p.app.animate = !e.currentTarget.checked && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            p.changed();
            p.persist();
          }}
        />{" "}
        Reduced motion
      </label>
      <label>
        World difficulty{" "}
        <select
          value={p.engine.save.settings.difficulty}
          onChange={(e) => {
            const d = e.currentTarget.value as "story" | "normal" | "expert";
            p.engine.save.settings.difficulty = d;
            p.app.combat.setDifficulty(d);
            p.changed();
            p.persist();
          }}
        >
          <option value="story">Story · soft Concept Gates</option>
          <option value="normal">Normal · soft Concept Gates</option>
          <option value="expert">Expert · hard Concept Gates</option>
        </select>
      </label>
      <p>{p.changes}</p>
    </>
  );
}
function Panel({ p }: { p: Progression }) {
  const [, tick] = useState(0);
  useEffect(() => p.subscribe(() => tick((n) => n + 1)), [p]);
  const e = p.engine,
    s = e.save;
  return (
    <>
      <header>
        <h2>Quests and progression</h2>
        <button type="button" onClick={() => p.close()}>
          Return to kingdom
        </button>
      </header>
      <p>
        Level {s.player.level} · {s.player.xp} XP · {s.player.gold} gold · {e.illumination.kingdom.toFixed(1)}% Light
      </p>
      <p role="status">{p.message}</p>
      {p.changes && <p>{p.changes}</p>}
      <nav aria-label="Progression pages">
        {["Quests", "Skills", "Equipment", "Bazaar", "Journal", "Saves"].map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={tab === p.tab}
            onClick={() => {
              p.tab = tab;
              p.changed();
            }}
          >
            {tab}
          </button>
        ))}
      </nav>
      {p.tab === "Quests" && <Quests p={p} />}
      {p.tab === "Skills" && <Skills p={p} />}
      {p.tab === "Equipment" && <Equipment p={p} />}
      {p.tab === "Bazaar" && (
        <>
          <h3>Bazaar shop</h3>
          <p>Gold comes from quests and first victories.</p>
          {SHOP.map((item) => (
            <p key={item.id}>
              {item.title}: {item.price} gold · owned {s.inventory[item.id] ?? 0}{" "}
              <button
                type="button"
                disabled={s.player.gold < item.price}
                onClick={() => {
                  e.buy(item.id);
                  p.changed();
                  p.persist();
                }}
              >
                Buy {item.title}
              </button>
            </p>
          ))}
          <h3>Concept Keys</h3>
          <ul>
            {s.keys.map((k) => (
              <li key={k}>{p.app.session.world.regions.find((r) => `key:${r.id}` === k)?.name ?? k}</li>
            ))}
          </ul>
        </>
      )}
      {p.tab === "Journal" && <Journal p={p} />}
      {p.tab === "Saves" && <Saves p={p} />}
    </>
  );
}
export function mountProgression(p: Progression, root: HTMLElement) {
  render(<Panel p={p} />, root);
}
