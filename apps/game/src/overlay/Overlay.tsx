import type { FactLink, FactSheet } from "@codebase-quest/shared";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { CombatPanel } from "../combat/CombatPanel.tsx";
import { FightCodex } from "../combat/FightCodex.tsx";
import { BADGES, badgesFor } from "../npc/appearance.ts";
import { completion, exportNotes, searchCodex } from "../npc/codex.ts";
import type { SourceSlice } from "../npc/facts.ts";
import { highlight, type Token } from "../npc/highlight.ts";
import type { AiStatus, OverlayStore } from "./store.ts";
import "./overlay.css";

/** Functions longer than this start collapsed. */
export const COLLAPSE_AFTER = 40;
const COLLAPSED_LINES = 24;
const CONFIDENCE = {
  exact: "exact (solid): resolved statically",
  likely: "likely (dashed): probable match",
  guess: "guess (dotted): name-based guess",
} as const;

function useStore(store: OverlayStore) {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), [store]);
  return store.state;
}
/** Arrow keys, Home and End move focus between a list's navigable buttons. */
function listKeys(event: KeyboardEvent) {
  const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-nav]")];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "ArrowDown"
      ? index + 1
      : event.key === "ArrowUp"
        ? index - 1
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : null;
  if (next === null || !items.length) return;
  event.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
}

function CodeView({ store, sheet }: { store: OverlayStore; sheet: FactSheet }) {
  const [slice, setSlice] = useState<SourceSlice | null>(null);
  const [tokens, setTokens] = useState<Token[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let live = true;
    setSlice(null);
    setTokens(null);
    setError(null);
    setExpanded(false);
    store.facts
      .source(sheet)
      .then(async (s) => {
        if (!live) return;
        setSlice(s);
        const t = await highlight(s.lines, sheet.language);
        if (live) setTokens(t);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [store, sheet]);
  if (error) return <p class="code-error">Could not load code: {error}</p>;
  if (!slice) return <p class="code-loading">Loading code…</p>;
  const long = slice.lines.length > COLLAPSE_AFTER;
  const shown = long && !expanded ? slice.lines.slice(0, COLLAPSED_LINES) : slice.lines;
  const masked = new Set(slice.masked);
  return (
    <div class="code-view">
      {slice.stale && (
        <p class="code-warning" role="note">
          This file changed since the world was built, so these lines may not match the analysis.
        </p>
      )}
      {slice.masked.length > 0 && <p class="code-warning">Possible secrets are hidden as [REDACTED].</p>}
      <section
        class="code"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable code must be reachable by keyboard (axe).
        tabIndex={0}
        aria-label={`Source of ${sheet.path}, lines ${slice.startLine} to ${slice.endLine}`}
        data-highlighted={tokens ? "true" : "false"}
      >
        <pre>
          {shown.map((line, i) => {
            const number = slice.startLine + i;
            return (
              <span class={`code-line${masked.has(number) ? " masked" : ""}`} key={number} data-line={number}>
                <span class="ln" aria-hidden="true">
                  {number}
                </span>
                <code>
                  {tokens?.[i]
                    ? tokens[i].map((t, j) => (
                        <span key={j} style={t.color ? { color: t.color } : undefined}>
                          {t.content}
                        </span>
                      ))
                    : line}
                </code>
              </span>
            );
          })}
        </pre>
      </section>
      {long && (
        <button type="button" class="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `Show all ${slice.lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function LinkList(props: { store: OverlayStore; title: string; links: FactLink[]; empty: string; scope: string }) {
  const { store, title, links, empty, scope } = props;
  const choose = store.state.choose;
  const previous = useRef<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const root = list.current;
    if (choose && links.some((l) => l.symbolId === choose))
      root?.querySelector<HTMLElement>(`[data-choice="${choose}"] button`)?.focus();
    else if (!choose && previous.current)
      root?.querySelector<HTMLElement>(`[data-symbol="${previous.current}"]`)?.focus();
    previous.current = choose;
  }, [choose, links]);
  const id = `${scope}-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>
        {title} <span class="count">({links.length})</span>
      </h3>
      {links.length === 0 ? (
        <p class="muted">{empty}</p>
      ) : (
        <ul class="links" ref={list} onKeyDown={listKeys}>
          {links.map((link) => {
            const meetable = link.symbolId !== null && Boolean(store.facts.npc(link.symbolId));
            const label = `${link.name} · ${link.path}:${link.line}`;
            return (
              <li key={`${link.symbolId ?? link.path}:${link.line}`}>
                <span class={`confidence ${link.confidence}`} title={CONFIDENCE[link.confidence]} aria-hidden="true" />
                {meetable ? (
                  <button
                    type="button"
                    class="link-button"
                    data-nav
                    data-symbol={link.symbolId}
                    aria-expanded={choose === link.symbolId}
                    onClick={() => store.choose(choose === link.symbolId ? null : link.symbolId)}
                  >
                    {label}
                    <span class="visually-hidden">, {link.confidence} confidence</span>
                  </button>
                ) : (
                  <span>
                    {label}
                    <span class="visually-hidden">, {link.confidence} confidence (not a character)</span>
                  </span>
                )}
                {meetable && choose === link.symbolId && link.symbolId && (
                  <span class="choice" data-choice={link.symbolId}>
                    <button type="button" data-nav onClick={() => store.navigate(link.symbolId ?? "", "walk")}>
                      Walk there
                    </button>
                    <button type="button" data-nav onClick={() => store.navigate(link.symbolId ?? "", "teleport")}>
                      Teleport
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Badges({ sheet }: { sheet: FactSheet }) {
  const ids = badgesFor(sheet);
  const extra = sheet.traits.filter((t) => !(t in BADGES) && t !== "exported");
  return (
    <ul class="badges" aria-label="Traits">
      <li class="badge">{sheet.exported ? "exported" : "private"}</li>
      {ids.map((id) => (
        <li class="badge" key={id}>
          {BADGES[id].label} <span class="muted">({BADGES[id].icon})</span>
        </li>
      ))}
      {extra.map((t) => (
        <li class="badge" key={t}>
          {t === "test" ? "test (trainer)" : t}
        </li>
      ))}
    </ul>
  );
}

/** The Code Panel's content; the Codex entry page shows the same details. */
function SymbolDetails({ store, sheet, headingId }: { store: OverlayStore; sheet: FactSheet; headingId: string }) {
  const editor = store.facts.editorUrl(sheet),
    github = store.facts.githubUrl(sheet);
  const m = sheet.metrics;
  return (
    <>
      <header class="panel-head">
        <h2 id={headingId} tabIndex={-1}>
          {sheet.displayName}
        </h2>
        <p class="where">
          {sheet.kind} · <span class="path">{sheet.path}</span>:{sheet.range.startLine}–{sheet.range.endLine}
          {sheet.group.kind === "class" && sheet.kind !== "class" ? ` · class ${sheet.group.label}` : ""}
        </p>
        <Badges sheet={sheet} />
      </header>
      <code class="signature">{sheet.signature}</code>
      {sheet.doc && <blockquote class="doc">{sheet.doc}</blockquote>}
      <CodeView store={store} sheet={sheet} />
      <dl class="metrics">
        <div>
          <dt>Lines</dt>
          <dd>{m.loc}</dd>
        </div>
        <div>
          <dt>Complexity</dt>
          <dd>{m.cyclomatic}</dd>
        </div>
        <div>
          <dt>Callers</dt>
          <dd>{m.fanIn}</dd>
        </div>
        <div>
          <dt>Callees</dt>
          <dd>{m.fanOut}</dd>
        </div>
        <div>
          <dt>Tests</dt>
          <dd>{sheet.testedBy.length}</dd>
        </div>
      </dl>
      <LinkList store={store} scope={headingId} title="Callers" links={sheet.callers} empty="No known callers." />
      <LinkList store={store} scope={headingId} title="Callees" links={sheet.callees} empty="Calls no known code." />
      <LinkList
        store={store}
        scope={headingId}
        title="Tested by"
        links={sheet.testedBy}
        empty="No tests reference this yet."
      />
      {sheet.tests.length > 0 && (
        <LinkList store={store} scope={headingId} title="Tests" links={sheet.tests} empty="" />
      )}
      <p class="legend">
        <span class="confidence exact" aria-hidden="true" /> exact <span class="confidence likely" aria-hidden="true" />{" "}
        likely <span class="confidence guess" aria-hidden="true" /> guess
      </p>
      <div class="actions">
        {editor ? (
          <a class="button" href={editor}>
            Open in editor
          </a>
        ) : (
          <span class="muted">Open in editor needs local play (cq play).</span>
        )}
        {github && (
          <a class="button" href={github} target="_blank" rel="noopener noreferrer">
            Open on GitHub
          </a>
        )}
      </div>
    </>
  );
}

function CodePanel({ store }: { store: OverlayStore }) {
  const panel = store.state.panel;
  const sheet = panel ? store.facts.sheet(panel.symbolId) : undefined;
  const heading = useRef<string | null>(null);
  useEffect(() => {
    if (sheet && heading.current !== sheet.symbolId) document.getElementById("code-panel-title")?.focus();
    heading.current = sheet?.symbolId ?? null;
  }, [sheet]);
  if (!panel || !sheet) return null;
  return (
    <>
      <section id="dialogue-box" aria-label={`${sheet.displayName} says`}>
        <p class="speaker">
          {sheet.displayName}
          {panel.source !== "template" && (
            <span class="source-tag"> · written by {panel.source === "agent" ? "your agent" : panel.source}</span>
          )}
        </p>
        <div aria-live="polite">
          {panel.lines.map((line) => (
            <p key={line.ruleId} data-rule={line.ruleId}>
              {line.text}
            </p>
          ))}
        </div>
      </section>
      <div
        id="code-panel"
        class={store.state.compact ? "compact" : ""}
        role="dialog"
        aria-modal="false"
        aria-labelledby="code-panel-title"
        data-symbol={sheet.symbolId}
      >
        <div class="panel-tools">
          <button type="button" onClick={() => store.toggleCompact()} aria-pressed={store.state.compact}>
            Compact
          </button>
          <button type="button" onClick={() => store.openCodex(sheet.symbolId, true)}>
            Add to notes
          </button>
          <button type="button" onClick={() => store.closePanel()}>
            Close · Esc
          </button>
        </div>
        <SymbolDetails store={store} sheet={sheet} headingId="code-panel-title" />
      </div>
    </>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Codex({ store }: { store: OverlayStore }) {
  const { codex } = store.state;
  const dialog = useRef<HTMLDivElement>(null);
  const notes = useRef<HTMLTextAreaElement>(null);
  const opened = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!codex.open) {
      opened.current = undefined;
      return;
    }
    if (opened.current === codex.entry) return;
    opened.current = codex.entry;
    if (codex.entry && store.state.focusNotes) {
      notes.current?.focus();
      store.notesFocused();
    } else if (codex.entry) document.getElementById("codex-entry-title")?.focus();
    else document.getElementById("codex-search")?.focus();
  });
  if (!codex.open) return null;
  const characters = store.facts.characters;
  const read = (id: string) => store.codex.has(id);
  const done = completion(characters, read, store.facts.world.regions);
  const entry = codex.entry ? store.facts.sheet(codex.entry) : undefined;
  const results = searchCodex(characters, read, codex);
  const traits = [...new Set(characters.flatMap((c) => c.traits))].sort();
  const trap = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex='0']"),
    ].filter((e) => !e.hasAttribute("disabled"));
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div class="codex-backdrop">
      <div id="codex" role="dialog" aria-modal="true" aria-labelledby="codex-title" ref={dialog} onKeyDown={trap}>
        <div class="panel-tools">
          {entry && (
            <button type="button" onClick={() => store.showEntry(null)}>
              ← All entries
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              download(
                `${store.facts.book.repo.name}-codex-notes.md`,
                exportNotes(store.facts.world.kingdom.name, store.codex, characters),
              )
            }
          >
            Export notes
          </button>
          <button type="button" onClick={() => store.closeCodex()}>
            Close · Esc
          </button>
        </div>
        <h2 id="codex-title">Codex</h2>
        <FightCodex store={store} symbolId={entry?.symbolId} />
        <p class="completion">
          <strong id="codex-count">{done.overall.read}</strong> of {done.overall.total} characters read (
          {done.overall.percent}%) · {store.seen.size} seen
          {!store.codex.persistent && " · notes are not saved in this browser"}
        </p>
        {entry ? (
          <article class="codex-entry">
            <SymbolDetails store={store} sheet={entry} headingId="codex-entry-title" />
            <label for="codex-notes">Personal notes (Markdown)</label>
            <textarea
              id="codex-notes"
              ref={notes}
              rows={6}
              value={store.codex.note(entry.symbolId)}
              onInput={(e) => {
                store.codex.setNote(entry.symbolId, (e.currentTarget as HTMLTextAreaElement).value);
              }}
            />
          </article>
        ) : (
          <>
            <ul class="regions" aria-label="Completion by region">
              {done.regions.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  <span class="bar" aria-hidden="true">
                    <span style={{ width: `${r.percent}%` }} />
                  </span>
                  <span>
                    {r.read}/{r.total} ({r.percent}%)
                  </span>
                </li>
              ))}
            </ul>
            <div class="filters">
              <label>
                Search by name or file
                <input
                  id="codex-search"
                  type="search"
                  value={codex.query}
                  onInput={(e) => store.filter({ query: (e.currentTarget as HTMLInputElement).value })}
                />
              </label>
              <label>
                Region
                <select
                  value={codex.regionId}
                  onChange={(e) => store.filter({ regionId: (e.currentTarget as HTMLSelectElement).value })}
                >
                  <option value="">All regions</option>
                  {store.facts.world.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kind
                <select
                  value={codex.kind}
                  onChange={(e) => store.filter({ kind: (e.currentTarget as HTMLSelectElement).value })}
                >
                  <option value="">All kinds</option>
                  {["function", "method", "class", "interface", "type"].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Trait
                <select
                  value={codex.trait}
                  onChange={(e) => store.filter({ trait: (e.currentTarget as HTMLSelectElement).value })}
                >
                  <option value="">All traits</option>
                  {traits.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p class="visually-hidden" aria-live="polite">
              {results.length} entries
            </p>
            {results.length === 0 ? (
              <p class="muted">
                {done.overall.read ? "No entries match." : "Talk to characters (E) to add them to your Codex."}
              </p>
            ) : (
              <ul class="codex-list" onKeyDown={listKeys}>
                {results.map((s) => (
                  <li key={s.symbolId}>
                    <button type="button" data-nav data-symbol={s.symbolId} onClick={() => store.showEntry(s.symbolId)}>
                      <strong>{s.displayName}</strong> <span class="path">{s.path}</span>
                      {store.codex.note(s.symbolId).trim() && <span class="muted"> · has notes</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
const LEVEL_NAMES: Record<string, string> = {
  search: "search",
  sampling: "your agent (MCP sampling)",
  bridge: "your agent (bridge)",
  ollama: "local model",
  api: "Anthropic API",
};
function aiSummary(ai: AiStatus | null): string {
  if (!ai || ai.mode === "off") return "AI is off: answers come from search over this repository.";
  if (ai.mode === "agent")
    return ai.levels.agent
      ? `Agent mode: your agent is connected${ai.levels.sampling ? " (sampling available)" : ""}.`
      : "Agent mode: no agent connected yet, so answers come from search.";
  if (ai.mode === "ollama") return "Local model (Ollama) answers after search.";
  const budget = ai.budget
    ? ` Today: $${ai.budget.spentUsd.toFixed(4)} of $${ai.budget.limitUsd.toFixed(2)} (${ai.budget.model}).`
    : "";
  return `API mode.${budget} Refusal fallback: ${ai.refusalFallback ? "on" : "off"}.`;
}
function GitlingPanel({ store }: { store: OverlayStore }) {
  const { gitling } = store.state;
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (gitling.open && !wasOpen.current) input.current?.focus();
    wasOpen.current = gitling.open;
    log.current?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  });
  if (!gitling.open) return null;
  const submit = (event: Event) => {
    event.preventDefault();
    const text = input.current?.value.trim() ?? "";
    if (!text) return;
    store.ask(text.slice(0, 500));
    if (input.current) input.current.value = "";
  };
  return (
    <div id="gitling-panel" role="dialog" aria-modal="false" aria-labelledby="gitling-title">
      <div class="panel-tools">
        <button type="button" onClick={() => store.closeGitling()}>
          Close · Esc
        </button>
      </div>
      <h2 id="gitling-title">Gitling</h2>
      <p class="muted ai-status">{aiSummary(gitling.ai)}</p>
      {gitling.consent && (
        <section class="consent" aria-labelledby="consent-title">
          <h3 id="consent-title">Send this to the Anthropic API?</h3>
          <p>{gitling.consent.sends}</p>
          <p class="muted">
            Your choice is remembered for this repository. You can turn API mode off with `cq ai mode off`.
          </p>
          <div class="actions">
            <button type="button" onClick={() => store.consentAndRetry(true)}>
              Allow for this repository
            </button>
            <button type="button" onClick={() => store.consentAndRetry(false)}>
              Not now
            </button>
          </div>
        </section>
      )}
      <ol class="gitling-log" ref={log} aria-live="polite">
        {gitling.entries.map((entry) => (
          <li key={entry.id} data-entry={entry.id}>
            <p class="question">
              <strong>You:</strong> {entry.question}
            </p>
            {entry.answers.map((a, i) => (
              <div class="answer" key={i} data-level={a.level}>
                <p>
                  <strong>Gitling:</strong> {a.text}
                </p>
                {a.refs.length > 0 && (
                  <ul class="citations" onKeyDown={listKeys}>
                    {a.refs.map((r) => (
                      <li key={`${r.path}:${r.startLine}`}>
                        {r.symbolId && store.facts.npc(r.symbolId) ? (
                          <button
                            type="button"
                            class="link-button"
                            data-nav
                            data-symbol={r.symbolId}
                            onClick={() => r.symbolId && store.talk(r.symbolId)}
                          >
                            {r.name} · {r.path}:{r.startLine}–{r.endLine}
                          </button>
                        ) : (
                          <span class="path">
                            {r.path}:{r.startLine}–{r.endLine}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p class="answered-by">answered by: {LEVEL_NAMES[a.level] ?? a.level}</p>
              </div>
            ))}
            {entry.pending && <p class="muted">Asking a better helper…</p>}
            {entry.note && <p class="muted">{entry.note}</p>}
          </li>
        ))}
      </ol>
      <form class="ask" onSubmit={submit}>
        <label for="gitling-question">Ask Gitling about the code</label>
        <div>
          <input id="gitling-question" ref={input} type="text" maxLength={500} autoComplete="off" />
          <button type="submit">Ask</button>
        </div>
      </form>
    </div>
  );
}
function Overlay({ store }: { store: OverlayStore }) {
  useStore(store);
  return (
    <>
      <GitlingPanel store={store} />
      <CodePanel store={store} />
      <Codex store={store} />
      {store.combat && (
        <CombatPanel
          controller={store.combat}
          tileset={store.tileset}
          afterword={(id) => store.facts.combatExplanation(id)}
          recall={(id) => (
            <p>
              {store.codex.data.bodyMaps[id]
                ? `${store.codex.data.bodyMaps[id]?.name}: ${store.codex.data.bodyMaps[id]?.cells.map((c) => c[2]).join(" → ")}`
                : "No body map recorded yet."}{" "}
              {store.codex.note(id)}
            </p>
          )}
        />
      )}
    </>
  );
}
export function mountOverlay(store: OverlayStore, parent: HTMLElement): HTMLElement {
  const root = document.createElement("div");
  root.id = "overlay-root";
  parent.append(root);
  render(<Overlay store={store} />, root);
  return root;
}
