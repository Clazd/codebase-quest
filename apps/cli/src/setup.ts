import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cqHome, loadAiConfig, saveAiConfig } from "@codebase-quest/content/node";
import { applyEdits, type FormattingOptions, modify, type ParseError, parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

/**
 * `cq setup` registers `cq mcp` and installs the Codebase Quest skill, modeled on
 * REA's reviewed setup: plan first (`--dry-run` writes nothing), explicit
 * approval, backups of every changed config, additive and idempotent edits that
 * are verified by reading them back, and an uninstall that removes only what
 * setup added (restoring the original bytes when nothing else changed).
 */
export const CLIENTS = ["claude_code", "claude_desktop", "codex", "cursor"] as const;
export type ClientName = (typeof CLIENTS)[number];
export const SERVER_KEY = "codebase-quest";
const SKILL_SOURCE = fileURLToPath(new URL("../../mcp/skill/codebase-quest/SKILL.md", import.meta.url));
const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

export interface SetupContext {
  home: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  cqHome: string;
  command: string;
  args: string[];
}
export function defaultContext(env = process.env): SetupContext {
  return {
    home: env.CQ_SETUP_HOME || homedir(),
    env,
    platform: process.platform,
    cqHome: cqHome(env),
    command: process.execPath,
    args: [MAIN, "mcp"],
  };
}
export interface ClientInfo {
  name: ClientName;
  displayName: string;
  configPath: string;
  format: "json" | "toml";
  skillDir: string | null;
  detected: boolean;
  note?: string;
}
export function clientInfo(name: ClientName, ctx: SetupContext): ClientInfo {
  const { home, env } = ctx;
  const skillShared = join(home, ".agents", "skills", SERVER_KEY);
  if (name === "claude_code") {
    const marker = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
    const configPath = join(env.CLAUDE_CONFIG_DIR || home, ".claude.json");
    return {
      name,
      displayName: "Claude Code",
      configPath,
      format: "json",
      skillDir: join(marker, "skills", SERVER_KEY),
      detected: existsSync(marker) || existsSync(configPath),
      note: "Restart Claude Code after setup.",
    };
  }
  if (name === "claude_desktop") {
    let configPath: string;
    if (ctx.platform === "win32") {
      // The MSIX build reads its package-private copy once it exists (see REA's client notes).
      const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
      const packaged = join(
        local,
        "Packages",
        "Claude_pzs8sxrjxfjjc",
        "LocalCache",
        "Roaming",
        "Claude",
        "claude_desktop_config.json",
      );
      const roaming = join(env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
      configPath = existsSync(packaged) ? packaged : roaming;
    } else if (ctx.platform === "darwin")
      configPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    else configPath = join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude", "claude_desktop_config.json");
    return {
      name,
      displayName: "Claude Desktop",
      configPath,
      format: "json",
      skillDir: null,
      detected: existsSync(dirname(configPath)),
      note: "Quit Claude Desktop fully before approving; a running app can rewrite its config. Run setup from a terminal Claude Desktop did not start.",
    };
  }
  if (name === "codex") {
    const dir = env.CODEX_HOME || join(home, ".codex");
    return {
      name,
      displayName: "Codex",
      configPath: join(dir, "config.toml"),
      format: "toml",
      skillDir: skillShared,
      detected: existsSync(dir),
      note: "Restart Codex after setup.",
    };
  }
  return {
    name,
    displayName: "Cursor",
    configPath: join(home, ".cursor", "mcp.json"),
    format: "json",
    skillDir: skillShared,
    detected: existsSync(join(home, ".cursor")),
    note: "Reload Cursor after setup.",
  };
}
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const readBytes = (path: string): Buffer | null => (existsSync(path) ? readFileSync(path) : null);
function symlinkOnPath(path: string): boolean {
  for (let p = resolve(path); ; p = dirname(p)) {
    try {
      if (lstatSync(p).isSymbolicLink()) return true;
    } catch {}
    if (dirname(p) === p) return false;
  }
}
function jsonEntry(name: ClientName, ctx: SetupContext) {
  return name === "claude_code"
    ? { type: "stdio", command: ctx.command, args: ctx.args, env: {} }
    : { command: ctx.command, args: ctx.args };
}
const TOML_HEADER =
  /^[ \t]*\[\s*mcp_servers\s*\.\s*(?:"codebase-quest"|'codebase-quest'|codebase-quest)\s*(?:\.[^\]]*)?\][ \t]*(?:#.*)?$/;
function tomlBlock(ctx: SetupContext): string {
  return `[mcp_servers.${SERVER_KEY}]\ncommand = ${JSON.stringify(ctx.command)}\nargs = [${ctx.args.map((a) => JSON.stringify(a)).join(", ")}]\nstartup_timeout_sec = 30\n`;
}
/** Removes our TOML table (and its sub-tables) plus the blank line setup inserted before it. */
export function removeTomlSection(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (TOML_HEADER.test(line)) {
      skipping = true;
      if (out.length && out.at(-1) === "") out.pop();
      continue;
    }
    if (skipping && /^[ \t]*\[/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  let result = out.join("\n");
  if (text.endsWith("\n") && !result.endsWith("\n")) result += "\n";
  return result;
}
function formatting(text: string): FormattingOptions {
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
  return {
    insertSpaces: !indent.includes("\t"),
    tabSize: indent.includes("\t") ? 1 : indent.length,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
  };
}
type Edit = { ok: true; text: string; present: boolean; current: boolean } | { ok: false; reason: string };
/** The config text with our server registered; `current` when it already matches. */
export function withRegistration(info: ClientInfo, original: string | null, ctx: SetupContext): Edit {
  if (info.format === "toml") {
    const text = original ?? "";
    let doc: Record<string, unknown>;
    try {
      doc = parseToml(text) as Record<string, unknown>;
    } catch (error) {
      return { ok: false, reason: `malformed TOML: ${error instanceof Error ? error.message.split("\n")[0] : ""}` };
    }
    const existing = (doc.mcp_servers as Record<string, unknown> | undefined)?.[SERVER_KEY] as
      | { command?: unknown; args?: unknown; startup_timeout_sec?: unknown }
      | undefined;
    const current =
      existing?.command === ctx.command &&
      JSON.stringify(existing.args) === JSON.stringify(ctx.args) &&
      existing.startup_timeout_sec === 30;
    if (current) return { ok: true, text, present: true, current: true };
    const base = existing ? removeTomlSection(text) : text;
    const glue = base === "" ? "" : base.endsWith("\n") ? "\n" : "\n\n";
    return { ok: true, text: `${base}${glue}${tomlBlock(ctx)}`, present: Boolean(existing), current: false };
  }
  const text = original ?? "";
  const errors: ParseError[] = [];
  const doc = text.trim() ? parseJsonc(text, errors, { allowTrailingComma: true }) : {};
  if (errors.length || (doc !== null && typeof doc !== "object") || Array.isArray(doc))
    return { ok: false, reason: "malformed JSON" };
  const servers = (doc as { mcpServers?: unknown }).mcpServers;
  if (servers !== undefined && (typeof servers !== "object" || servers === null || Array.isArray(servers)))
    return { ok: false, reason: "mcpServers is not an object" };
  const existing = (servers as Record<string, unknown> | undefined)?.[SERVER_KEY];
  const entry = jsonEntry(info.name, ctx);
  if (existing && JSON.stringify(existing) === JSON.stringify(entry))
    return { ok: true, text, present: true, current: true };
  const source = text.trim() ? text : "{}\n";
  const edited = applyEdits(
    source,
    modify(source, ["mcpServers", SERVER_KEY], entry, { formattingOptions: formatting(source) }),
  );
  return { ok: true, text: edited.endsWith("\n") ? edited : `${edited}\n`, present: Boolean(existing), current: false };
}
/** The config text without our server (unrelated entries and formatting kept). */
export function withoutRegistration(info: ClientInfo, original: string): Edit {
  if (info.format === "toml") {
    const text = removeTomlSection(original);
    return { ok: true, text, present: text !== original, current: false };
  }
  const errors: ParseError[] = [];
  const doc = parseJsonc(original, errors, { allowTrailingComma: true }) as {
    mcpServers?: Record<string, unknown>;
  } | null;
  if (errors.length) return { ok: false, reason: "malformed JSON" };
  if (!doc?.mcpServers || !(SERVER_KEY in doc.mcpServers))
    return { ok: true, text: original, present: false, current: false };
  const edited = applyEdits(
    original,
    modify(original, ["mcpServers", SERVER_KEY], undefined, { formattingOptions: formatting(original) }),
  );
  return { ok: true, text: edited, present: true, current: false };
}
const ManifestSchema = z.object({
  version: z.literal(1),
  clients: z.record(
    z.string(),
    z.object({
      configPath: z.string(),
      created: z.boolean(),
      originalSha256: z.string().nullable(),
      backupPath: z.string().nullable(),
      writtenSha256: z.string(),
      skillDir: z.string().nullable(),
      skillSha256: z.string().nullable(),
    }),
  ),
});
type Manifest = z.infer<typeof ManifestSchema>;
const manifestPath = (ctx: SetupContext) => join(ctx.cqHome, "setup-state.json");
export function loadManifest(ctx: SetupContext): Manifest {
  try {
    return ManifestSchema.parse(JSON.parse(readFileSync(manifestPath(ctx), "utf8")));
  } catch {
    return { version: 1, clients: {} };
  }
}
function saveManifest(ctx: SetupContext, manifest: Manifest) {
  mkdirSync(ctx.cqHome, { recursive: true });
  atomicWrite(manifestPath(ctx), `${JSON.stringify(manifest, null, 2)}\n`);
}
function atomicWrite(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${SERVER_KEY}-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(temp, data);
  renameSync(temp, path);
}
export interface ClientStep {
  client: ClientName;
  displayName: string;
  configPath: string;
  action: "add" | "update" | "unchanged" | "blocked";
  reason?: string;
  backup: { path: string; kind: "first" | "recovery" | "existing" } | null;
  skill: { dir: string; action: "install" | "update" | "unchanged" | "blocked"; reason?: string } | null;
  note?: string;
  /** Internal: expected current bytes and new text. */
  originalSha256: string | null;
  next?: string;
}
export interface SetupPlan {
  status: "planned";
  operation: "setup" | "uninstall";
  steps: ClientStep[];
  command: string[];
  notice: string;
}
export const AGENT_NOTICE =
  "Agent mode: your agent reads fact sheets and masked code from this repository through MCP, and writes game text back. It already works in your workspace; Codebase Quest sends nothing anywhere else.";
const skillText = () => readFileSync(SKILL_SOURCE, "utf8");
/** Which backup will hold the bytes from before this edit (REA style: keep the first snapshot). */
function backupFor(configPath: string, original: Buffer | null): ClientStep["backup"] {
  if (!original) return null;
  const first = `${configPath}.codequest.backup`;
  const existing = readBytes(first);
  if (!existing) return { path: first, kind: "first" };
  if (existing.equals(original)) return { path: first, kind: "existing" };
  return { path: `${first}.${sha256(original)}.recovery`, kind: "recovery" };
}
export function selectedClients(ctx: SetupContext, explicit: ClientName[]): ClientName[] {
  if (explicit.length) return [...new Set(explicit)];
  // Without --client: only clients that already have our registration (detection is context, not permission).
  return CLIENTS.filter((name) => {
    const info = clientInfo(name, ctx);
    const text = readBytes(info.configPath)?.toString("utf8");
    if (!text) return false;
    const edit = withRegistration(info, text, ctx);
    return edit.ok && edit.present;
  });
}
export function planSetup(ctx: SetupContext, clients: ClientName[], options: { skill?: boolean } = {}): SetupPlan {
  const steps = clients.map((name): ClientStep => {
    const info = clientInfo(name, ctx);
    const original = readBytes(info.configPath);
    const base = {
      client: name,
      displayName: info.displayName,
      configPath: info.configPath,
      note: info.note,
      originalSha256: original ? sha256(original) : null,
    };
    let skill: ClientStep["skill"] = null;
    if (options.skill !== false && info.skillDir) {
      const file = join(info.skillDir, "SKILL.md");
      const current = readBytes(file);
      skill = symlinkOnPath(info.skillDir)
        ? { dir: info.skillDir, action: "blocked", reason: "skill path is a symbolic link" }
        : {
            dir: info.skillDir,
            action: !current ? "install" : current.toString("utf8") === skillText() ? "unchanged" : "update",
          };
    }
    if (symlinkOnPath(info.configPath))
      return { ...base, action: "blocked", reason: "config path is a symbolic link", backup: null, skill };
    if (original && !lstatSync(info.configPath).isFile())
      return { ...base, action: "blocked", reason: "config path is not a regular file", backup: null, skill };
    const edit = withRegistration(info, original?.toString("utf8") ?? null, ctx);
    if (!edit.ok) return { ...base, action: "blocked", reason: edit.reason, backup: null, skill };
    if (edit.current) return { ...base, action: "unchanged", backup: null, skill };
    return {
      ...base,
      action: edit.present ? "update" : "add",
      backup: backupFor(info.configPath, original),
      skill,
      next: edit.text,
    };
  });
  return { status: "planned", operation: "setup", steps, command: [ctx.command, ...ctx.args], notice: AGENT_NOTICE };
}
export type ApplyResult =
  | { status: "applied"; changed: string[]; unchanged: string[] }
  | { status: "blocked" | "failed"; reason: string; changed: string[] };
/** Writes the approved plan. A blocked step or a config changed since planning stops before any write. */
export function applySetup(ctx: SetupContext, plan: SetupPlan): ApplyResult {
  const blocked = plan.steps.find((s) => s.action === "blocked" || s.skill?.action === "blocked");
  if (blocked)
    return {
      status: "blocked",
      reason: `${blocked.displayName}: ${blocked.reason ?? blocked.skill?.reason}`,
      changed: [],
    };
  for (const step of plan.steps) {
    const now = readBytes(step.configPath);
    if ((now ? sha256(now) : null) !== step.originalSha256)
      return {
        status: "blocked",
        reason: `${step.displayName}: config changed after the plan was shown; rerun setup`,
        changed: [],
      };
  }
  const manifest = loadManifest(ctx);
  const changed: string[] = [],
    unchanged: string[] = [];
  for (const step of plan.steps) {
    const info = clientInfo(step.client, ctx);
    const original = readBytes(step.configPath);
    let record = manifest.clients[step.client];
    if (step.next !== undefined && (step.action === "add" || step.action === "update")) {
      if (original && step.backup && step.backup.kind !== "existing") copyFileSync(step.configPath, step.backup.path);
      atomicWrite(step.configPath, step.next);
      const readback = withRegistration(info, readFileSync(step.configPath, "utf8"), ctx);
      if (!readback.ok || !readback.current) {
        if (original) atomicWrite(step.configPath, original);
        else rmSync(step.configPath, { force: true });
        return {
          status: "failed",
          reason: `${step.displayName}: the written config could not be verified; the original was restored${step.backup ? ` (backup: ${step.backup.path})` : ""}`,
          changed,
        };
      }
      record = {
        configPath: step.configPath,
        created: record?.created ?? !original,
        originalSha256: record?.originalSha256 ?? (original ? sha256(original) : null),
        backupPath: record?.backupPath ?? step.backup?.path ?? null,
        writtenSha256: sha256(step.next),
        skillDir: record?.skillDir ?? null,
        skillSha256: record?.skillSha256 ?? null,
      };
      changed.push(step.client);
    } else unchanged.push(step.client);
    if (step.skill && step.skill.action !== "unchanged") {
      atomicWrite(join(step.skill.dir, "SKILL.md"), skillText());
      changed.push(`${step.client}:skill`);
    }
    if (step.skill || record) {
      const current = readBytes(step.configPath);
      record ??= {
        configPath: step.configPath,
        created: false,
        originalSha256: current ? sha256(current) : null,
        backupPath: null,
        writtenSha256: current ? sha256(current) : "",
        skillDir: null,
        skillSha256: null,
      };
      if (step.skill) {
        record.skillDir = step.skill.dir;
        record.skillSha256 = sha256(skillText());
      }
      manifest.clients[step.client] = record;
    }
  }
  saveManifest(ctx, manifest);
  const ai = loadAiConfig(ctx.cqHome);
  if (!ai.notices.agent) {
    ai.notices.agent = new Date().toISOString();
    saveAiConfig(ai, ctx.cqHome);
  }
  return { status: "applied", changed, unchanged };
}
export interface RemovalStep {
  client: ClientName;
  displayName: string;
  configPath: string;
  action: "restore-original" | "remove-entry" | "delete-created" | "unchanged" | "blocked";
  reason?: string;
  skill: { dir: string; action: "remove" | "retain"; reason?: string } | null;
}
export function planUninstall(ctx: SetupContext, clients: ClientName[]): RemovalStep[] {
  const manifest = loadManifest(ctx);
  return clients.map((name) => {
    const info = clientInfo(name, ctx);
    const record = manifest.clients[name];
    const current = readBytes(info.configPath);
    let skill: RemovalStep["skill"] = null;
    if (record?.skillDir) {
      const installed = readBytes(join(record.skillDir, "SKILL.md"));
      skill =
        installed && sha256(installed) === record.skillSha256 && !symlinkOnPath(record.skillDir)
          ? { dir: record.skillDir, action: "remove" }
          : { dir: record.skillDir, action: "retain", reason: "skill files were changed or are missing" };
    }
    const base = { client: name, displayName: info.displayName, configPath: info.configPath, skill };
    if (!current) return { ...base, action: "unchanged" as const };
    if (symlinkOnPath(info.configPath))
      return { ...base, action: "blocked" as const, reason: "config path is a symbolic link" };
    if (record && sha256(current) === record.writtenSha256) {
      if (record.created) return { ...base, action: "delete-created" as const };
      const backup = record.backupPath ? readBytes(record.backupPath) : null;
      if (backup && sha256(backup) === record.originalSha256) return { ...base, action: "restore-original" as const };
    }
    const edit = withoutRegistration(info, current.toString("utf8"));
    if (!edit.ok) return { ...base, action: "blocked" as const, reason: edit.reason };
    return { ...base, action: edit.present ? ("remove-entry" as const) : ("unchanged" as const) };
  });
}
export function applyUninstall(ctx: SetupContext, steps: RemovalStep[]): ApplyResult {
  const blocked = steps.find((s) => s.action === "blocked");
  if (blocked) return { status: "blocked", reason: `${blocked.displayName}: ${blocked.reason}`, changed: [] };
  const manifest = loadManifest(ctx);
  const changed: string[] = [],
    unchanged: string[] = [];
  for (const step of steps) {
    const record = manifest.clients[step.client];
    const info = clientInfo(step.client, ctx);
    if (step.action === "restore-original" && record?.backupPath)
      atomicWrite(step.configPath, readFileSync(record.backupPath));
    else if (step.action === "delete-created") rmSync(step.configPath, { force: true });
    else if (step.action === "remove-entry") {
      const edit = withoutRegistration(info, readFileSync(step.configPath, "utf8"));
      if (edit.ok) atomicWrite(step.configPath, edit.text);
    }
    if (step.action === "unchanged") unchanged.push(step.client);
    else changed.push(step.client);
    if (step.skill?.action === "remove") {
      rmSync(join(step.skill.dir, "SKILL.md"), { force: true });
      try {
        rmdirSync(step.skill.dir);
      } catch {}
      changed.push(`${step.client}:skill`);
    }
    delete manifest.clients[step.client];
  }
  saveManifest(ctx, manifest);
  return { status: "applied", changed, unchanged };
}
export function describePlan(plan: SetupPlan): string {
  const lines = [`Codebase Quest setup plan`, `MCP server command: ${plan.command.join(" ")}`, ""];
  if (!plan.steps.length) lines.push("No clients selected. Use --client claude_code|claude_desktop|codex|cursor.");
  for (const s of plan.steps) {
    lines.push(`- ${s.displayName}: ${s.action}${s.reason ? ` (${s.reason})` : ""}`);
    lines.push(`    config: ${s.configPath}`);
    if (s.backup)
      lines.push(`    backup: ${s.backup.path}${s.backup.kind === "existing" ? " (already holds these bytes)" : ""}`);
    if (s.skill)
      lines.push(
        `    skill: ${s.skill.action} ${join(s.skill.dir, "SKILL.md")}${s.skill.reason ? ` (${s.skill.reason})` : ""}`,
      );
    if (s.note && s.action !== "unchanged") lines.push(`    note: ${s.note}`);
  }
  lines.push("", plan.notice);
  return `${lines.join("\n")}\n`;
}
export function describeRemoval(steps: RemovalStep[]): string {
  const lines = ["Codebase Quest uninstall plan", ""];
  for (const s of steps) {
    lines.push(`- ${s.displayName}: ${s.action}${s.reason ? ` (${s.reason})` : ""}`);
    lines.push(`    config: ${s.configPath}`);
    if (s.skill)
      lines.push(`    skill: ${s.skill.action} ${s.skill.dir}${s.skill.reason ? ` (${s.skill.reason})` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}
export interface SetupIo {
  interactive: boolean;
  confirm: (question: string) => Promise<boolean>;
  log: (text: string) => void;
}
/** `cq setup` / `cq uninstall` argument handling. Returns an exit code and stdout text. */
export async function setupCommand(
  args: readonly string[],
  io: SetupIo,
  ctx = defaultContext(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  const operation = args[0] === "uninstall" ? "uninstall" : "setup";
  const explicit: ClientName[] = [];
  let dryRun = false,
    yes = false,
    skill = true,
    asJson = false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes") yes = true;
    else if (a === "--json") asJson = true;
    else if (a === "--skill=false") skill = false;
    else if (a === "--client") {
      const value = args[++i] as ClientName;
      if (!CLIENTS.includes(value)) throw new Error(`--client must be one of ${CLIENTS.join(", ")}`);
      explicit.push(value);
    } else throw new Error(`Unknown ${operation} option: ${a}`);
  }
  if (yes && !explicit.length) throw new Error("--yes needs an explicit --client (detection is not permission)");
  let clients = explicit.length ? explicit : operation === "uninstall" ? [...CLIENTS] : selectedClients(ctx, []);
  if (operation === "setup" && !explicit.length && io.interactive && !dryRun) {
    for (const name of CLIENTS) {
      const info = clientInfo(name, ctx);
      if (clients.includes(name) || !info.detected) continue;
      if (await io.confirm(`Register Codebase Quest with ${info.displayName}? [y/N] `)) clients.push(name);
    }
  }
  if (operation === "uninstall") {
    const steps = planUninstall(ctx, clients).filter((s) => explicit.length || s.action !== "unchanged" || s.skill);
    const text = asJson ? `${JSON.stringify({ status: "planned", steps }, null, 2)}\n` : describeRemoval(steps);
    if (dryRun) return { code: 0, stdout: text, stderr: "" };
    io.log(text);
    if (!yes && !(io.interactive && (await io.confirm("Apply these removals? [y/N] "))))
      return io.interactive
        ? { code: 0, stdout: "Cancelled. Nothing was changed.\n", stderr: "" }
        : { code: 1, stdout: "", stderr: "cq: needs_confirmation (rerun with --yes --client <name>)\n" };
    const result = applyUninstall(ctx, steps);
    return result.status === "applied"
      ? {
          code: 0,
          stdout: `Removed Codebase Quest from: ${result.changed.join(", ") || "nothing (already clean)"}\n`,
          stderr: "",
        }
      : { code: 1, stdout: "", stderr: `cq: ${result.reason}\n` };
  }
  clients = [...new Set(clients)];
  const plan = planSetup(ctx, clients, { skill });
  const text = asJson
    ? `${JSON.stringify({ ...plan, steps: plan.steps.map(({ next: _n, ...s }) => s) }, null, 2)}\n`
    : describePlan(plan);
  if (dryRun) return { code: 0, stdout: text, stderr: "" };
  io.log(text);
  if (plan.steps.every((s) => s.action === "unchanged" && (!s.skill || s.skill.action === "unchanged")))
    return { code: 0, stdout: "Already set up. Nothing changed.\n", stderr: "" };
  if (!yes && !(io.interactive && (await io.confirm("Apply these changes? [y/N] "))))
    return io.interactive
      ? { code: 0, stdout: "Cancelled. Nothing was changed.\n", stderr: "" }
      : { code: 1, stdout: "", stderr: "cq: needs_confirmation (rerun with --yes --client <name>)\n" };
  const result = applySetup(ctx, plan);
  if (result.status !== "applied") return { code: 1, stdout: "", stderr: `cq: ${result.reason}\n` };
  const restart = plan.steps.filter((s) => s.action !== "unchanged").map((s) => s.displayName);
  return {
    code: 0,
    stdout: `Set up Codebase Quest for: ${result.changed.join(", ") || "nothing new"}.\n${restart.length ? `Restart: ${restart.join(", ")}.\n` : ""}Undo any time with: cq uninstall --client <name>\n`,
    stderr: "",
  };
}
