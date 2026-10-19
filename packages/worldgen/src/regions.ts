import { posix } from "node:path";
import type { Biome, CodeGraph, FileNode } from "@codebase-quest/shared";
import { compare, worldId } from "./random.ts";
export interface RegionChoice {
  id: string;
  path: string;
  name: string;
  biome: Biome;
  files: FileNode[];
  loc: number;
}
const biomeRules: readonly [Biome, RegExp, string][] = [
  ["port", /api|routes?|controllers?/i, "Port"],
  ["mines", /models?|database|storage|(?:^|\/)db$/i, "Mines"],
  ["artisan", /(?:^|\/)(?:ui|components?|views?)(?:\/|$)/i, "Artisan Quarter"],
  ["capital", /services?|domain|core/i, "Capital"],
  ["bazaar", /utils?|helpers?|(?:^|\/)lib$/i, "Bazaar"],
  ["training", /tests?|specs?/i, "Training Grounds"],
  ["clocktower", /config/i, "Clocktower"],
  ["forge", /scripts?|build|tools?/i, "Forge"],
  ["library", /docs?|documentation/i, "Great Library"],
  ["fortress", /auth|security/i, "Fortress"],
  ["ruins", /legacy|deprecated/i, "Ruins"],
];
export function classifyBiome(path: string, files: FileNode[], graph: CodeGraph): Biome {
  if (files.length && files.filter((f) => f.role === "test").length > files.length / 2) return "training";
  const rule = biomeRules.find(([, pattern]) => pattern.test(path));
  if (rule) return rule[0];
  const fileIds = new Set(files.map((f) => f.id));
  const routes = graph.entryPoints.filter((e) => e.kind === "http" && fileIds.has(e.fileId)).length;
  const symbols = graph.symbols.filter((s) => fileIds.has(s.fileId)).length;
  if (routes && routes >= symbols / 2) return "port";
  if (files.length && files.filter((f) => f.role === "docs").length > files.length / 2) return "library";
  return "wildlands";
}
export function chooseRegions(graph: CodeGraph): RegionChoice[] {
  const groups = new Map<string, FileNode[]>();
  const source = graph.files.filter((f) => f.language && ["source", "test"].includes(f.role));
  const key = (file: FileNode) => {
    const parts = file.path.split("/");
    if (["packages", "apps"].includes(parts[0] ?? "") && parts.length > 2) return parts.slice(0, 2).join("/");
    if (parts[0] === "src") return parts.length > 2 ? parts.slice(0, 2).join("/") : null;
    return parts.length > 1 ? (parts[0] ?? null) : null;
  };
  for (const file of source) {
    const name = key(file);
    if (name) {
      const group = groups.get(name) ?? [];
      group.push(file);
      groups.set(name, group);
    }
  }
  if (!groups.size) groups.set("Outskirts", []);
  const candidates = [...groups.keys()].sort(compare);
  const entry = graph.entryPoints.find((e) => e.kind === "main") ?? graph.entryPoints[0];
  const entryPath = graph.files.find((f) => f.id === entry?.fileId)?.path;
  const main = candidates.find((p) => entryPath?.startsWith(`${p}/`)) ?? candidates[0] ?? "Outskirts";
  // Assign every retained file once, including root metadata and docs.
  groups.forEach((_, name) => {
    groups.set(name, []);
  });
  for (const file of graph.files) {
    const region =
      candidates.filter((p) => file.path.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0] ?? main;
    groups.get(region)?.push(file);
  }
  const codeLoc = (files: FileNode[]) => files.reduce((sum, f) => sum + (f.language ? f.loc : 0), 0);
  const total = codeLoc(graph.files) || 1;
  let choices = [...groups].map(([path, files]) => ({ path, files, loc: codeLoc(files) }));
  const small = choices.filter((c) => c.loc / total < 0.02);
  choices = choices.filter((c) => !small.includes(c));
  const outskirts = small.flatMap((c) => c.files);
  choices.sort((a, b) => b.loc - a.loc || compare(a.path, b.path));
  while (choices.length + (outskirts.length ? 1 : 0) > 12) {
    const removed = choices.pop();
    if (removed) outskirts.push(...removed.files);
  }
  if (outskirts.length || !choices.length)
    choices.push({ path: "Outskirts", files: outskirts, loc: codeLoc(outskirts) });
  return choices
    .sort((a, b) => b.loc - a.loc || compare(a.path, b.path))
    .map((c) => {
      const biome = classifyBiome(c.path, c.files, graph);
      const prefix = biomeRules.find(([b]) => b === biome)?.[2] ?? "Wildlands";
      return {
        ...c,
        id: worldId("region", c.path),
        biome,
        name: c.path === "Outskirts" ? "Outskirts" : `${prefix} of ${posix.basename(c.path)}`,
        files: c.files.sort((a, b) => compare(a.id, b.id)),
      };
    });
}
