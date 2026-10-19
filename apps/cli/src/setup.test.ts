import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  applySetup,
  CLIENTS,
  clientInfo,
  planSetup,
  removeTomlSection,
  type SetupContext,
  setupCommand,
} from "./setup.ts";

type TomlDoc = { model?: string; mcp_servers: Record<string, unknown> };
const ORIGINAL = {
  claude: `{
  "numStartups": 12,
  "mcpServers": {
    "other": { "command": "other-server", "args": [] }
  },
  "projects": {}
}
`,
  codex: `# my codex settings
model = "gpt-x"

[mcp_servers.other]
command = "other"
args = ["--flag"]
`,
  cursor: `{\n\t"mcpServers": {}\n}\n`,
};
function home(): SetupContext {
  const root = mkdtempSync(join(tmpdir(), "cq-setup-home-"));
  const ctx: SetupContext = {
    home: root,
    env: { APPDATA: join(root, "AppData", "Roaming"), LOCALAPPDATA: join(root, "AppData", "Local") },
    platform: "win32",
    cqHome: join(root, ".codequest"),
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: ["C:\\repo\\apps\\cli\\src\\main.ts", "mcp"],
  };
  writeFileSync(join(root, ".claude.json"), ORIGINAL.claude);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, ".codex"));
  writeFileSync(join(root, ".codex", "config.toml"), ORIGINAL.codex);
  mkdirSync(join(root, ".cursor"));
  writeFileSync(join(root, ".cursor", "mcp.json"), ORIGINAL.cursor);
  mkdirSync(join(root, "AppData", "Roaming", "Claude"), { recursive: true });
  return ctx;
}
/** Every file under the home folder with its content hash. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out[relative(root, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(root);
  return out;
}
const io = (answer: boolean) => ({ interactive: true, confirm: async () => answer, log: () => {} });
const all = (["claude_code", "claude_desktop", "codex", "cursor"] as const).flatMap((c) => ["--client", c]);

describe("cq setup", () => {
  it("dry-run shows the plan and writes nothing", async () => {
    const ctx = home();
    const before = snapshot(ctx.home);
    const result = await setupCommand(["setup", ...all, "--dry-run"], io(true), ctx);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Claude Code: add");
    expect(result.stdout).toContain("Codex: add");
    expect(result.stdout).toContain(".claude.json.codequest.backup");
    expect(result.stdout).toContain("Agent mode:");
    expect(snapshot(ctx.home)).toEqual(before);
    const json = JSON.parse(
      (await setupCommand(["setup", "--client", "codex", "--dry-run", "--json"], io(true), ctx)).stdout,
    );
    expect(json.status).toBe("planned");
    expect(json.steps[0].next).toBeUndefined();
  });
  it("needs approval: declining or a non-interactive run without --yes changes nothing", async () => {
    const ctx = home();
    const before = snapshot(ctx.home);
    expect((await setupCommand(["setup", "--client", "codex"], io(false), ctx)).stdout).toContain("Cancelled");
    const auto = await setupCommand(
      ["setup", "--client", "codex"],
      { interactive: false, confirm: async () => true, log: () => {} },
      ctx,
    );
    expect(auto.code).toBe(1);
    expect(auto.stderr).toContain("needs_confirmation");
    await expect(setupCommand(["setup", "--yes"], io(true), ctx)).rejects.toThrow(/explicit --client/);
    expect(snapshot(ctx.home)).toEqual(before);
  });
  it("applies additively with backups, is idempotent, and uninstall restores the originals byte for byte", async () => {
    const ctx = home();
    const applied = await setupCommand(["setup", ...all], io(true), ctx);
    expect(applied.code).toBe(0);
    // Unrelated entries survive; our server is registered in each format.
    const claude = JSON.parse(readFileSync(join(ctx.home, ".claude.json"), "utf8"));
    expect(claude.numStartups).toBe(12);
    expect(claude.mcpServers.other).toEqual({ command: "other-server", args: [] });
    expect(claude.mcpServers["codebase-quest"]).toEqual({
      type: "stdio",
      command: ctx.command,
      args: ctx.args,
      env: {},
    });
    const codex = parseToml(readFileSync(join(ctx.home, ".codex", "config.toml"), "utf8")) as TomlDoc;
    expect(codex.model).toBe("gpt-x");
    expect(codex.mcp_servers["codebase-quest"]).toEqual({
      command: ctx.command,
      args: ctx.args,
      startup_timeout_sec: 30,
    });
    expect(readFileSync(join(ctx.home, ".codex", "config.toml"), "utf8")).toContain("# my codex settings");
    const desktop = clientInfo("claude_desktop", ctx).configPath;
    expect(JSON.parse(readFileSync(desktop, "utf8")).mcpServers["codebase-quest"].command).toBe(ctx.command);
    // Backups hold the exact original bytes; the skill is installed where each client reads it.
    expect(readFileSync(join(ctx.home, ".claude.json.codequest.backup"), "utf8")).toBe(ORIGINAL.claude);
    expect(readFileSync(join(ctx.home, ".codex", "config.toml.codequest.backup"), "utf8")).toBe(ORIGINAL.codex);
    expect(existsSync(`${desktop}.codequest.backup`)).toBe(false); // it did not exist before
    expect(readFileSync(join(ctx.home, ".claude", "skills", "codebase-quest", "SKILL.md"), "utf8")).toMatch(
      /^---\nname: codebase-quest/,
    );
    expect(existsSync(join(ctx.home, ".agents", "skills", "codebase-quest", "SKILL.md"))).toBe(true);
    // Running again changes nothing at all.
    const after = snapshot(ctx.home);
    const mtimes = Object.keys(after).map((f) => statSync(join(ctx.home, f)).mtimeMs);
    const again = await setupCommand(["setup", ...all], io(true), ctx);
    expect(again.stdout).toBe("Already set up. Nothing changed.\n");
    expect(snapshot(ctx.home)).toEqual(after);
    expect(Object.keys(after).map((f) => statSync(join(ctx.home, f)).mtimeMs)).toEqual(mtimes);
    // Without --client, setup only refreshes existing registrations (all four here).
    expect(planSetup(ctx, CLIENTS.slice()).steps.every((s) => s.action === "unchanged")).toBe(true);
    // Uninstall: untouched configs come back byte for byte; a created file is removed.
    const removed = await setupCommand(["uninstall", ...all], io(true), ctx);
    expect(removed.code).toBe(0);
    expect(readFileSync(join(ctx.home, ".claude.json"), "utf8")).toBe(ORIGINAL.claude);
    expect(readFileSync(join(ctx.home, ".codex", "config.toml"), "utf8")).toBe(ORIGINAL.codex);
    expect(readFileSync(join(ctx.home, ".cursor", "mcp.json"), "utf8")).toBe(ORIGINAL.cursor);
    expect(existsSync(desktop)).toBe(false);
    expect(existsSync(join(ctx.home, ".claude", "skills", "codebase-quest"))).toBe(false);
  });
  it("uninstall keeps unrelated changes made after setup and removes only our entry", async () => {
    const ctx = home();
    await setupCommand(["setup", "--client", "claude_code", "--client", "codex"], io(true), ctx);
    const claudePath = join(ctx.home, ".claude.json");
    const claude = JSON.parse(readFileSync(claudePath, "utf8"));
    claude.numStartups = 13;
    writeFileSync(claudePath, `${JSON.stringify(claude, null, 2)}\n`);
    const tomlPath = join(ctx.home, ".codex", "config.toml");
    writeFileSync(tomlPath, `${readFileSync(tomlPath, "utf8")}\n[mcp_servers.later]\ncommand = "later"\n`);
    await setupCommand(["uninstall", "--client", "claude_code", "--client", "codex"], io(true), ctx);
    const after = JSON.parse(readFileSync(claudePath, "utf8"));
    expect(after.numStartups).toBe(13);
    expect(after.mcpServers).toEqual({ other: { command: "other-server", args: [] } });
    const toml = parseToml(readFileSync(tomlPath, "utf8")) as TomlDoc;
    expect(Object.keys(toml.mcp_servers).sort()).toEqual(["later", "other"]);
  });
  it("blocks the whole transaction on a malformed config, before any write", async () => {
    const ctx = home();
    writeFileSync(join(ctx.home, ".cursor", "mcp.json"), "{ not json");
    const before = snapshot(ctx.home);
    const plan = planSetup(ctx, ["claude_code", "cursor"]);
    expect(plan.steps.find((s) => s.client === "cursor")?.action).toBe("blocked");
    expect(applySetup(ctx, plan)).toMatchObject({ status: "blocked" });
    expect(snapshot(ctx.home)).toEqual(before);
    const cmd = await setupCommand(["setup", "--client", "claude_code", "--client", "cursor"], io(true), ctx);
    expect(cmd.code).toBe(1);
    expect(cmd.stderr).toMatch(/Cursor: malformed JSON/);
  });
  it("refuses a config that changed after the plan was shown", () => {
    const ctx = home();
    const plan = planSetup(ctx, ["codex"]);
    writeFileSync(join(ctx.home, ".codex", "config.toml"), `${ORIGINAL.codex}# edited meanwhile\n`);
    expect(applySetup(ctx, plan)).toMatchObject({
      status: "blocked",
      reason: expect.stringMatching(/changed after the plan/),
    });
  });
  it("keeps the first backup and preserves a recovery copy when it differs", async () => {
    const ctx = home();
    writeFileSync(join(ctx.home, ".claude.json.codequest.backup"), "older snapshot\n");
    const plan = planSetup(ctx, ["claude_code"]);
    expect(plan.steps[0]?.backup?.kind).toBe("recovery");
    applySetup(ctx, plan);
    expect(readFileSync(join(ctx.home, ".claude.json.codequest.backup"), "utf8")).toBe("older snapshot\n");
    const recovery = readdirSync(ctx.home).find((f) => f.endsWith(".recovery"));
    expect(recovery && readFileSync(join(ctx.home, recovery), "utf8")).toBe(ORIGINAL.claude);
  });
  it("removes exactly the TOML table it added", () => {
    const block = '[mcp_servers.codebase-quest]\ncommand = "x"\nargs = ["mcp"]\n';
    expect(removeTomlSection(`${ORIGINAL.codex}\n${block}`)).toBe(ORIGINAL.codex);
    expect(removeTomlSection(`a = 1\n\n${block}[next]\nb = 2\n`)).toBe("a = 1\n[next]\nb = 2\n");
  });
});
