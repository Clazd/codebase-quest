import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AnalyzerConfigSchema, analyze, graphStats, serializeGraph } from "@codebase-quest/analyzer";
import { CodeGraphSchema, WorldModelSchema } from "@codebase-quest/shared";
import { generate, writeWorld } from "@codebase-quest/worldgen";
import { secretPath } from "../../../packages/analyzer/src/discover.ts";
import { type CliResult, run } from "./cli.ts";

/** Interactive yes/no on the terminal (stderr), so stdout stays clean for results. */
async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(?:es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}
export async function runCommand(argv: readonly string[]): Promise<CliResult> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const command = args[0];
  if (command === "mcp") {
    // stdout belongs to the MCP protocol: never print anything else there.
    const { runStdio } = await import("../../mcp/src/index.ts");
    await runStdio({ cwd: process.cwd() });
    return { code: 0, stdout: "", stderr: "" };
  }
  if (command === "setup" || command === "uninstall" || command === "ai") {
    try {
      if (command === "ai") {
        const { aiCommand } = await import("./ai.ts");
        return await aiCommand(args, confirm);
      }
      const { setupCommand } = await import("./setup.ts");
      return await setupCommand(args, {
        interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
        confirm,
        log: (text) => process.stderr.write(text),
      });
    } catch (error) {
      return {
        code: 1,
        stdout: "",
        stderr: `cq: ${error instanceof Error ? error.message : String(error)}
`,
      };
    }
  }
  if (command === "play") {
    try {
      const { playCommand } = await import("./play.ts");
      return await playCommand(args);
    } catch (error) {
      return {
        code: 1,
        stdout: "",
        stderr: `cq: ${error instanceof Error ? error.message : "Could not start game"}\n`,
      };
    }
  }
  if (command === "generate" || command === "world") {
    try {
      if (command === "world") {
        const path = args[2];
        if (args[1] !== "preview" || !path || args.length !== 3)
          throw new Error("Usage: cq world preview <world.json>");
        if (secretPath(path.replaceAll("\\", "/"))) throw new Error("Credential path refused.");
        writeWorld(WorldModelSchema.parse(JSON.parse(readFileSync(path, "utf8"))), dirname(resolve(path)), true);
        return { code: 0, stdout: `Regenerated SVG previews beside ${path}\n`, stderr: "" };
      }
      const path = args[1];
      const flag = args.indexOf("--out");
      const out = flag >= 0 ? args[flag + 1] : undefined;
      if (!path || !out || flag !== 2 || args.length !== 4)
        throw new Error("Usage: cq generate <graph.json> --out <directory>");
      if (secretPath(path.replaceAll("\\", "/")) || secretPath(out.replaceAll("\\", "/")))
        throw new Error("Credential path refused.");
      const world = generate(CodeGraphSchema.parse(JSON.parse(readFileSync(path, "utf8"))));
      writeWorld(world, out);
      return {
        code: 0,
        stdout: `Generated ${world.regions.length} regions, ${world.buildings.length} buildings, ${world.npcs.length} NPC spots in ${out}\n`,
        stderr: "",
      };
    } catch (error) {
      return {
        code: 1,
        stdout: "",
        stderr: `cq: ${error instanceof Error ? error.message : "World generation failed"}\n`,
      };
    }
  }
  if (command !== "analyze" && command !== "stats") return run(args);
  try {
    const path = args[1];
    if (!path || path.startsWith("--")) throw new Error(`Usage: cq ${command} <path>`);
    if (command === "stats") {
      if (args.length !== 2) throw new Error("Usage: cq stats <graph.json>");
      if (secretPath(path.replaceAll("\\", "/"))) throw new Error("Credential path refused.");
      return { code: 0, stdout: graphStats(CodeGraphSchema.parse(JSON.parse(readFileSync(path, "utf8")))), stderr: "" };
    }
    let output: string | undefined;
    let configPath: string | undefined;
    let pretty = false;
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--pretty") {
        pretty = true;
        continue;
      }
      if (arg === "--out" || arg === "--config") {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
        if (arg === "--out") output = value;
        else configPath = value;
      } else throw new Error(`Unknown analyze option: ${arg}`);
    }
    if (configPath && secretPath(configPath.replaceAll("\\", "/"))) throw new Error("Credential config path refused.");
    const config = configPath ? AnalyzerConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8"))) : {};
    const graph = await analyze(path, config);
    const json = serializeGraph(graph, pretty);
    if (output) {
      const target = resolve(output);
      if (secretPath(target.replaceAll("\\", "/"))) throw new Error("Credential output path refused.");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, json);
      return { code: 0, stdout: `Wrote CodeGraph to ${output}\n`, stderr: "" };
    }
    return { code: 0, stdout: json, stderr: "" };
  } catch (error) {
    return { code: 1, stdout: "", stderr: `cq: ${error instanceof Error ? error.message : "Analysis failed"}\n` };
  }
}
