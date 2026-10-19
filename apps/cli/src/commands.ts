import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AnalyzerConfigSchema, analyze, graphStats, serializeGraph } from "@codebase-quest/analyzer";
import { CodeGraphSchema } from "@codebase-quest/shared";
import { secretPath } from "../../../packages/analyzer/src/discover.ts";
import { type CliResult, run } from "./cli.ts";

export async function runCommand(argv: readonly string[]): Promise<CliResult> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const command = args[0];
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
