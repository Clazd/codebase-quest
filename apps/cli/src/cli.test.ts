import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { helpText, run } from "./cli.ts";

describe("cq", () => {
  it("prints the package version", () => {
    expect(run(["--version"])).toEqual({ code: 0, stdout: `${pkg.version}\n`, stderr: "" });
    expect(run(["-v"]).stdout).toBe(`${pkg.version}\n`);
  });

  it("ignores a forwarded -- separator", () => {
    expect(run(["--", "--version"]).stdout).toBe(`${pkg.version}\n`);
  });

  it("prints help for help, --help and no arguments", () => {
    for (const argv of [["help"], ["--help"], []]) {
      const result = run(argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(helpText());
    }
    expect(helpText()).toContain("Usage: cq <command>");
    expect(helpText()).toContain("not available yet");
  });

  it("fails on unknown commands", () => {
    const result = run(["fly"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unknown command "fly"');
  });

  it("runs from source with Node", () => {
    const main = fileURLToPath(new URL("./main.ts", import.meta.url));
    const out = execFileSync(process.execPath, [main, "--version"], { encoding: "utf8" });
    expect(out).toBe(`${pkg.version}\n`);
  });
});
