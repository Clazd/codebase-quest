import type { WorldPosition } from "@codebase-quest/shared";
import { required } from "./required.ts";
import type { ExploreSession } from "./session.ts";

const COLORS: Record<string, string> = {
  water: "#245c80",
  wall: "#687286",
  rock: "#596478",
  grass: "#42694d",
  tree: "#284b3d",
  sand: "#a88c54",
  floor: "#857863",
  door: "#d7a65d",
};
export class ExploreHud {
  readonly root = document.createElement("section");
  readonly mini: HTMLCanvasElement;
  readonly dialog: HTMLDialogElement;
  readonly full: HTMLCanvasElement;
  readonly debug: HTMLElement;
  readonly breadcrumb: HTMLElement;
  readonly status: HTMLElement;
  readonly action: HTMLButtonElement;
  title = true;
  paused = false;
  mapOpen = false;
  debugOpen = false;
  /** A Code Panel or the Codex is open: the world pauses. */
  overlayOpen = false;
  private returnFocus: HTMLElement | null = null;
  readonly session: ExploreSession;
  constructor(
    session: ExploreSession,
    handlers: {
      start: () => void;
      interact: () => void;
      zoom: (delta: number) => void;
      codex: () => void;
      gitling: () => void;
    },
  ) {
    this.session = session;
    this.root.id = "explore-hud";
    this.root.setAttribute("aria-label", "World navigation");
    this.root.innerHTML = `<header><span class="brand">CODEBASE QUEST</span><nav aria-label="Code location" id="breadcrumb"></nav><span id="light"></span></header>
      <div class="world-tools"><button type="button" id="interact">Interact · E</button><button type="button" id="map-toggle">Map · M</button><button type="button" id="codex-toggle">Codex · C</button><button type="button" id="gitling-toggle">Gitling · G</button><button type="button" id="zoom-out" aria-label="Zoom out">−</button><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="pause-toggle">Pause · Esc</button></div>
      <canvas id="minimap" width="176" height="120" role="img" aria-label="Minimap: explored tiles and current position"></canvas>
      <output id="explore-status" aria-live="polite"></output><pre id="explore-debug" hidden></pre>
      <div id="world-title"><p class="eyebrow">EVERY CODEBASE IS A WORLD</p><h1></h1><p>Follow imports. Explore folders. Step inside your code.</p><button type="button" id="continue">Enter the kingdom</button><p class="controls">WASD / arrows to walk · Shift to run<br>Click a path to move · E to talk or enter a door · C for the Codex · G to ask Gitling</p></div>
      <dialog aria-labelledby="map-heading"><h2 id="map-heading">Kingdom map</h2><canvas id="full-map" width="672" height="480" role="img" aria-label="Overworld with region names and your location"></canvas><p id="map-location"></p><p>Dark areas are unexplored. Gold marks your current region.</p><div id="pause-settings" hidden><p>Settings: more options arrive in Phase 12.</p><label><input type="checkbox" id="readable-font"> Use system font for map labels</label></div><button type="button" id="close-panel">Return to world</button></dialog>`;
    required(document.querySelector("main")).append(this.root);
    const get = <T extends HTMLElement>(id: string) => required(this.root.querySelector<T>(`#${id}`));
    this.mini = get<HTMLCanvasElement>("minimap");
    this.full = get<HTMLCanvasElement>("full-map");
    this.dialog = get<HTMLDialogElement>("map-heading").parentElement as HTMLDialogElement;
    this.debug = get("explore-debug");
    this.breadcrumb = get("breadcrumb");
    this.status = get("explore-status");
    this.action = get<HTMLButtonElement>("interact");
    required(this.root.querySelector("h1")).textContent = session.world.kingdom.name;
    get("continue").onclick = () => {
      this.title = false;
      get("world-title").hidden = true;
      handlers.start();
      this.action.focus();
    };
    this.action.onclick = handlers.interact;
    get("map-toggle").onclick = () => this.toggleMap();
    get("codex-toggle").onclick = () => {
      if (!this.blocked) handlers.codex();
    };
    get("gitling-toggle").onclick = () => {
      if (!this.blocked) handlers.gitling();
    };
    get("pause-toggle").onclick = () => this.togglePause();
    get("zoom-in").onclick = () => handlers.zoom(1);
    get("zoom-out").onclick = () => handlers.zoom(-1);
    get("close-panel").onclick = () => this.close();
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    get<HTMLInputElement>("readable-font").onchange = (event) => {
      document.documentElement.dataset.mapFont = (event.target as HTMLInputElement).checked ? "system" : "pixel";
    };
    this.action.disabled = true;
    get<HTMLButtonElement>("continue").disabled = true;
  }
  ready() {
    const button = required(this.root.querySelector<HTMLButtonElement>("#continue"));
    button.disabled = false;
    button.focus();
  }
  assetFailure() {
    const button = required(this.root.querySelector<HTMLButtonElement>("#continue"));
    button.textContent = "Reload assets";
    button.disabled = false;
    button.onclick = () => location.reload();
    this.status.textContent = "Tileset failed to load. Check the local world assets, then reload.";
    button.focus();
  }
  retryTitle() {
    this.title = true;
    required(this.root.querySelector<HTMLElement>("#world-title")).hidden = false;
  }
  get blocked() {
    return this.title || this.paused || this.mapOpen || this.overlayOpen;
  }
  private open(map: boolean) {
    this.returnFocus = document.activeElement as HTMLElement;
    this.mapOpen = map;
    this.paused = !map;
    required(this.root.querySelector("#map-heading")).textContent = map ? "Kingdom map" : "Paused";
    this.full.hidden = !map;
    (this.root.querySelector("#pause-settings") as HTMLElement).hidden = map;
    this.drawMap(this.full, true);
    required(this.root.querySelector("#map-location")).textContent = this.session.breadcrumb;
    this.dialog.showModal();
  }
  close() {
    this.mapOpen = false;
    this.paused = false;
    this.dialog.close();
    this.returnFocus?.focus();
  }
  toggleMap() {
    if (this.title || this.overlayOpen) return;
    if (this.dialog.open) this.close();
    else this.open(true);
  }
  togglePause() {
    if (this.title || this.overlayOpen) return;
    if (this.dialog.open) this.close();
    else this.open(false);
  }
  drawMap(canvas: HTMLCanvasElement, full = false, guide: WorldPosition | null = null) {
    const s = this.session,
      map = full ? required(s.maps.get(s.world.kingdom.overworldMap)) : s.map,
      fog = s.fog(map.id),
      ctx = required(canvas.getContext("2d"));
    ctx.fillStyle = "#101923";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / map.width, canvas.height / map.height),
      ox = (canvas.width - map.width * scale) / 2,
      oy = (canvas.height - map.height * scale) / 2;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if (fog[y * map.width + x]) {
          ctx.fillStyle = COLORS[required(map.ground[y * map.width + x])] ?? "#a0a484";
          ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
        }
    for (const t of s.world.transitions)
      for (const p of [t.from, t.to])
        if (p.mapId === map.id && fog[p.y * map.width + p.x]) {
          ctx.fillStyle = "#b1e4ff";
          ctx.fillRect(ox + p.x * scale, oy + p.y * scale, Math.max(2, scale), Math.max(2, scale));
        }
    if (guide && guide.mapId === map.id) {
      ctx.strokeStyle = "#ffdc87";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox + (guide.x + 0.5) * scale, oy + (guide.y + 0.5) * scale, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const at = full && s.map.kind !== "overworld" ? s.region?.entrance : s.position;
    if (at) {
      ctx.fillStyle = "#ffe3a0";
      ctx.beginPath();
      ctx.arc(ox + (at.x + 0.5) * scale, oy + (at.y + 0.5) * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (full) {
      ctx.font = "12px system-ui";
      for (const r of s.world.regions) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#101923";
        ctx.lineWidth = 3;
        const x = ox + (r.bounds.x + 2) * scale,
          y = oy + (r.bounds.y + 3) * scale;
        ctx.strokeText(r.name, x, y);
        ctx.fillText(r.name, x, y);
      }
    }
  }
  update(message: string, canAct: boolean, guide: WorldPosition | null, debug: string) {
    this.breadcrumb.textContent = this.session.breadcrumb;
    required(this.root.querySelector("#light")).textContent = `${this.session.seenFiles.size} files seen`;
    this.status.textContent = message;
    this.action.disabled = !canAct || this.blocked;
    this.debug.hidden = !this.debugOpen;
    this.debug.textContent = debug;
    this.drawMap(this.mini, false, guide);
  }
}
