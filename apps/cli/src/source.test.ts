import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSourceReader, maskLines, safeRelativePath, sourceResponse } from "./source.ts";

const tiny = fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url));
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");
const ID = (n: number) => n.toString(16).padStart(12, "0");

describe("source endpoint", () => {
  it("returns the exact lines of the real file", () => {
    const text = readFileSync(join(tiny, "src/utils/slugify.ts"), "utf8");
    const read = createSourceReader(tiny, [{ id: ID(1), path: "src/utils/slugify.ts", hash: sha1(text) }]);
    const result = read(ID(1), 2, 8);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.lines).toEqual(text.split("\n").slice(1, 8));
    expect(result.body.lines[0]).toBe("export function slugify(text: string): string {");
    expect(result.body).toMatchObject({ startLine: 2, endLine: 8, stale: false, masked: [] });
    expect(result.body.totalLines).toBe(text.split("\n").length - 1);
  });
  it("validates IDs and ranges", () => {
    const read = createSourceReader(tiny, [{ id: ID(1), path: "src/utils/slugify.ts", hash: "x" }]);
    expect(read("../../etc", 1, 2).status).toBe(400);
    expect(read(ID(1), 0, 2).status).toBe(400);
    expect(read(ID(1), 5, 2).status).toBe(400);
    expect(read(ID(1), 1, 5000).status).toBe(416);
    expect(read(ID(1), 1, 999).status).toBe(416);
    expect(read(ID(2), 1, 2).status).toBe(404);
    expect(sourceResponse(read, ID(1), "start=1&end=x").status).toBe(400);
    expect(sourceResponse(read, ID(1), "start=1&end=2").status).toBe(200);
    // The analyzer's hash differs, so the slice is honestly marked stale.
    const stale = read(ID(1), 1, 1);
    expect(stale.status === 200 && stale.body.stale).toBe(true);
  });
  it("refuses paths outside the repository (path traversal)", () => {
    const parent = mkdtempSync(join(tmpdir(), "cq-source-")),
      repo = join(parent, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(parent, "outside.ts"), "export const secret = 1;\n");
    writeFileSync(join(repo, "src", "ok.ts"), "export const ok = 1;\n");
    const files = [
      { id: ID(1), path: "../outside.ts", hash: "" },
      { id: ID(2), path: "src/../../outside.ts", hash: "" },
      { id: ID(3), path: join(parent, "outside.ts").replaceAll("\\", "/"), hash: "" },
      { id: ID(4), path: "src\\..\\..\\outside.ts", hash: "" },
      { id: ID(5), path: "src/ok.ts", hash: "" },
      { id: ID(6), path: "C:/Windows/win.ini", hash: "" },
    ];
    const read = createSourceReader(repo, files);
    for (const n of [1, 2, 3, 4, 6]) expect(read(ID(n), 1, 1).status, files[n - 1]?.path).toBe(403);
    expect(read(ID(5), 1, 1).status).toBe(200);
    let linked = false;
    try {
      symlinkSync(join(parent, "outside.ts"), join(repo, "src", "link.ts"), "file");
      linked = true;
    } catch {
      // Windows without symlink privileges: the lexical checks above still apply.
    }
    if (linked) {
      const viaLink = createSourceReader(repo, [{ id: ID(7), path: "src/link.ts", hash: "" }]);
      expect(viaLink(ID(7), 1, 1).status).toBe(403);
    }
  });
  it("refuses secret-skipped files even when listed", () => {
    const repo = mkdtempSync(join(tmpdir(), "cq-source-secret-"));
    mkdirSync(join(repo, "config"));
    mkdirSync(join(repo, "node_modules"));
    for (const name of [".env", ".env.local", "server.pem", "config/secrets.json", "node_modules/x.js"])
      writeFileSync(join(repo, name), "TOKEN=must-not-appear\n");
    const paths = [".env", ".env.local", "server.pem", "config/secrets.json", "node_modules/x.js"];
    const read = createSourceReader(
      repo,
      paths.map((path, i) => ({ id: ID(i + 1), path, hash: "" })),
    );
    paths.forEach((path, i) => {
      const result = read(ID(i + 1), 1, 1);
      expect(result.status, path).toBe(403);
      expect(JSON.stringify(result.body)).not.toContain("must-not-appear");
    });
    expect(paths.every((p) => !safeRelativePath(p))).toBe(true);
  });
  it("masks obvious secrets without changing line numbers", () => {
    const lines = [
      "const a = 1;",
      'const apiKey = "sk-abcdefghijklmnopqrstuv";',
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA",
      "-----END RSA PRIVATE KEY-----",
      "done();",
    ];
    const shown = maskLines(lines);
    expect(shown.lines).toHaveLength(lines.length);
    expect(shown.masked).toEqual([2, 3, 4, 5]);
    expect(shown.lines.join("\n")).not.toContain("sk-abcdefghijklmnopqrstuv");
    expect(shown.lines.join("\n")).not.toContain("MIIEowIBAAKCAQEA");
    expect(shown.lines[5]).toBe("done();");
  });
});
