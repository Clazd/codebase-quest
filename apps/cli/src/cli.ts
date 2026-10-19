import { SCHEMA_VERSION } from "@codebase-quest/shared";
import pkg from "../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Commands that exist today. Later phases add analyze, generate, play, setup, mcp… */
const COMMANDS = [
  ["help", "Show this help"],
  ["--version, -v", "Print the version"],
  ["analyze <path>", "Analyze safely [--out graph.json] [--pretty] [--config file.json]"],
  ["stats <graph.json>", "Summarize a validated CodeGraph"],
  ["generate <graph>", "Generate world/maps/previews --out <directory>"],
  ["world preview <json>", "Regenerate a world's SVG previews"],
  ["play <path>", "Walk your repository [--no-open] [--port N]"],
] as const;

/** Commands on the roadmap, shown so people know what's coming (never pretend they work). */
const PLANNED = [["setup / mcp", "Connect your own AI agent through MCP", "Phase 06"]] as const;

export function helpText(): string {
  const pad = (s: string) => s.padEnd(20);
  return [
    `cq ${VERSION}: Codebase Quest. Every codebase is a world. Go explore.`,
    "",
    "Usage: cq <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map(([name, text]) => `  ${pad(name)}${text}`),
    "",
    "Coming later (not available yet):",
    ...PLANNED.map(([name, text, phase]) => `  ${pad(name)}${text} (${phase})`),
    "",
    `Data schema version: ${SCHEMA_VERSION}`,
    "Docs: https://github.com/Clazd/codebase-quest",
    "",
  ].join("\n");
}

/** Runs the CLI with arguments (without `node` and the script path). Pure: no process access. */
export function run(argv: readonly string[]): CliResult {
  // `pnpm cq -- --version` may forward the separator itself.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const [command] = args;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { code: 0, stdout: helpText(), stderr: "" };
  }
  if (command === "--version" || command === "-v" || command === "version") {
    return { code: 0, stdout: `${VERSION}\n`, stderr: "" };
  }
  return {
    code: 1,
    stdout: "",
    stderr: `cq: unknown command "${command}". Run "cq help" to see what's available.\n`,
  };
}
