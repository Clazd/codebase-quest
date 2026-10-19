import { posix } from "node:path";
import type { CodeGraph, Edge, SymbolNode } from "@codebase-quest/shared";
import { parse } from "jsonc-parser";
import type { AnalyzerConfig } from "./config.ts";
import type { SourceFile } from "./discover.ts";
import type { Extracted, RawCall, RawImport } from "./extract.ts";
import { diagnostic, id } from "./util.ts";

export function link(
  graph: CodeGraph,
  sources: SourceFile[],
  parsed: Map<string, Extracted>,
  config: AnalyzerConfig,
): void {
  const files = new Map(graph.files.map((f) => [f.path, f]));
  const symbols = new Map(graph.symbols.map((s) => [s.id, s]));
  const sourceByPath = new Map(sources.map((f) => [f.path, f]));
  const fileById = new Map(graph.files.map((f) => [f.id, f]));
  const recoveryPaths = new Set(graph.diagnostics.filter((d) => d.code === "parse-error").map((d) => d.path));
  const byFile = new Map<string, SymbolNode[]>();
  for (const s of graph.symbols) {
    const group = byFile.get(s.fileId) ?? [];
    group.push(s);
    byFile.set(s.fileId, group);
  }
  const resolutions = new Map<string, Map<RawImport, string | null>>();
  const aliases: Record<string, string[]> = {};
  let baseUrl = "";
  const tsconfig = sourceByPath.get("tsconfig.json");
  if (tsconfig)
    try {
      const parsedConfig = parse(tsconfig.text) as {
        compilerOptions?: { paths?: Record<string, unknown>; baseUrl?: unknown };
      };
      const options = parsedConfig.compilerOptions;
      baseUrl = typeof options?.baseUrl === "string" ? options.baseUrl : "";
      for (const [pattern, targets] of Object.entries(options?.paths ?? {}))
        if (Array.isArray(targets) && targets.every((t) => typeof t === "string"))
          aliases[pattern] = targets as string[];
    } catch {
      graph.diagnostics.push(diagnostic("tsconfig.json", "config-error", null, "Unable to parse basic path aliases."));
    }
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];
  function fileAt(path: string): string | null {
    path = posix.normalize(path);
    if (path.startsWith("../") || path.startsWith("/")) return null;
    const stems = [path, path.replace(/\.(?:js|mjs|cjs)$/, "")];
    for (const stem of stems)
      for (const candidate of [
        stem,
        ...extensions.map((e) => stem + e),
        ...extensions.map((e) => `${stem}/index${e}`),
        `${stem}/__init__.py`,
      ])
        if (files.has(candidate)) return candidate;
    return null;
  }
  function resolveImport(path: string, imp: RawImport): string | null {
    if (imp.python) {
      const prefix = /^\.+/.exec(imp.source)?.[0] ?? "";
      const tail = imp.source.slice(prefix.length).replaceAll(".", "/");
      if (prefix) {
        let dir = posix.dirname(path);
        for (let i = 1; i < prefix.length; i++) dir = posix.dirname(dir);
        const base = posix.join(dir, tail);
        // from . import module resolves to the module, not only __init__.py.
        const submodule = fileAt(posix.join(base, imp.bindings[0]?.imported ?? ""));
        if (submodule && imp.bindings[0]) {
          imp.bindings[0].namespace = true;
          return submodule;
        }
        return fileAt(base);
      }
      const submodule = fileAt(posix.join(tail, imp.bindings[0]?.imported ?? ""));
      if (submodule && imp.bindings[0]) {
        imp.bindings[0].namespace = true;
        return submodule;
      }
      return fileAt(tail);
    }
    if (imp.source.startsWith(".")) return fileAt(posix.join(posix.dirname(path), imp.source));
    for (const [pattern, targets] of Object.entries(aliases)) {
      const [before, after] = pattern.split("*");
      const matches = pattern.includes("*")
        ? imp.source.startsWith(before ?? "") && imp.source.endsWith(after ?? "")
        : imp.source === pattern;
      if (matches)
        for (const target of targets) {
          const middle = imp.source.slice(before?.length ?? 0, after ? -after.length : undefined);
          const found = fileAt(posix.join(baseUrl, target.replace("*", middle)));
          if (found) return found;
        }
    }
    return null;
  }
  const manifestDeps = new Set<string>();
  for (const source of sources.filter((s) => s.role === "manifest")) {
    if (source.path.endsWith("package.json"))
      try {
        const pkg = JSON.parse(source.text) as Record<string, unknown>;
        for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])
          for (const name of Object.keys((pkg[key] ?? {}) as object)) manifestDeps.add(name);
      } catch {
        graph.diagnostics.push(diagnostic(source.path, "manifest-error", null, "Invalid package manifest JSON."));
      }
    else
      for (const match of source.text.matchAll(/["']([a-zA-Z][\w-]+)(?:[<>=!~[][^"']*)?["']/g))
        manifestDeps.add(match[1] ?? "");
  }
  const addEdge = (
    from: string,
    to: string,
    kind: Edge["kind"],
    confidence: Edge["confidence"],
    line: number,
    label: string,
  ) => {
    graph.edges.push({
      id: id(from, `edge:${kind}`, `${to}:${line}:${label}`),
      from,
      to,
      kind,
      confidence,
      line,
      label,
    });
  };
  for (const [path, data] of parsed) {
    const file = files.get(path);
    if (!file) continue;
    const map = new Map<RawImport, string | null>();
    resolutions.set(path, map);
    for (const imp of data.imports) {
      const target = resolveImport(path, imp);
      map.set(imp, target);
      if (target) {
        addEdge(file.id, files.get(target)?.id ?? "", "imports", "exact", imp.line, imp.source);
        continue;
      }
      if (
        !imp.source.startsWith(".") &&
        !Object.keys(aliases).some((pattern) => imp.source.startsWith(pattern.split("*")[0] ?? ""))
      ) {
        const name = imp.python
          ? (imp.source.split(".")[0] ?? imp.source)
          : imp.source.startsWith("@")
            ? imp.source.split("/").slice(0, 2).join("/")
            : (imp.source.split("/")[0] ?? imp.source);
        const moduleId = id(`external/${name}`, "module", name);
        if (!graph.modules.some((m) => m.id === moduleId))
          graph.modules.push({
            id: moduleId,
            path: `external/${name}`,
            name,
            kind: "external",
            declared: manifestDeps.has(name),
          });
        addEdge(file.id, moduleId, "imports", "exact", imp.line, imp.source);
      } else
        graph.diagnostics.push(
          diagnostic(path, "unresolved-import", imp.line, `Unresolved internal import: ${imp.source}`),
        );
    }
  }
  function exported(path: string, name: string, visited = new Set<string>()): SymbolNode | null {
    const key = `${path}#${name}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const file = files.get(path);
    if (!file) return null;
    const candidates = (byFile.get(file.id) ?? []).filter((s) => s.parentId === null && s.exported);
    if (name === "default") {
      const code = sourceByPath.get(path)?.text ?? "";
      const named = /export\s+default\s+(?:(?:async\s+)?function\s*|class\s+)?(\w+)/.exec(code)?.[1];
      return candidates.find((s) => s.name === named || s.name === "default") ?? null;
    }
    const direct = candidates.find((s) => s.name === name);
    if (direct) return direct;
    // export {local as public} and Python imported names are explicit syntax.
    const code = sourceByPath.get(path)?.text ?? "";
    if (new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(code)) {
      const local = (byFile.get(file.id) ?? []).find((s) => s.name === name);
      if (local) return local;
    }
    for (const imp of parsed.get(path)?.imports ?? []) {
      if (!imp.reexport && !path.endsWith("__init__.py")) continue;
      const binding = imp.bindings.find((b) => b.local === name);
      const target = resolutions.get(path)?.get(imp);
      if (target && (binding || !imp.bindings.length)) {
        const found = exported(target, binding?.imported ?? name, visited);
        if (found) return found;
      }
    }
    return null;
  }
  function resolveCall(path: string, call: RawCall): { target: SymbolNode; confidence: Edge["confidence"] } | null {
    const file = files.get(path);
    if (!file || call.dynamic) return null;
    const owner = symbols.get(call.from);
    const scopes: (string | null)[] = [owner?.id ?? null];
    let scope = owner;
    while (scope?.parentId) {
      scopes.push(scope.parentId);
      scope = symbols.get(scope.parentId);
    }
    scopes.push(null);
    if (call.receiver === "this" || call.receiver === "self" || call.receiver === "cls") {
      let container = owner;
      while (container && container.kind !== "class")
        container = container.parentId ? symbols.get(container.parentId) : undefined;
      const target = container && graph.symbols.find((s) => s.parentId === container.id && s.name === call.property);
      return target ? { target, confidence: "exact" } : null;
    }
    if (!call.receiver) {
      if (owner?.parameters.some((p) => p.name === call.callee)) return null;
      for (const scopeId of scopes) {
        const candidates = (byFile.get(file.id) ?? []).filter(
          (s) => s.name === call.callee && s.parentId === scopeId && ["function", "class"].includes(s.kind),
        );
        if (candidates.length === 1 && (!call.shadowed || candidates[0]?.kind === "function"))
          return { target: candidates[0] as SymbolNode, confidence: "exact" };
      }
    }
    for (const imp of parsed.get(path)?.imports ?? []) {
      const binding = imp.bindings.find((b) => b.local === (call.receiver ?? call.callee));
      const targetPath = resolutions.get(path)?.get(imp);
      if (!binding || !targetPath) continue;
      if (call.shadowed) return null;
      if (owner?.parameters.some((p) => p.name === binding.local)) return null;
      const target = exported(targetPath, binding.namespace ? (call.property ?? "") : binding.imported);
      if (target && (!call.receiver || binding.namespace))
        return { target, confidence: binding.namespace ? "likely" : "exact" };
    }
    if (call.shadowed) return null;
    // Arbitrary object methods have no receiver type proof in Phase 02.
    if (call.receiver) return null;
    const matches = graph.symbols.filter(
      (s) => s.name === call.callee && s.fileId !== file.id && ["function", "class"].includes(s.kind),
    );
    return matches.length === 1 ? { target: matches[0] as SymbolNode, confidence: "guess" } : null;
  }
  for (const [path, data] of parsed) {
    const file = files.get(path);
    if (!file) continue;
    for (const base of data.heritage) {
      const resolved = resolveCall(path, {
        from: base.from,
        callee: base.name,
        receiver: null,
        property: null,
        dynamic: false,
        line: base.line,
        shadowed: false,
      });
      if (resolved) addEdge(base.from, resolved.target.id, base.kind, resolved.confidence, base.line, base.name);
      else
        graph.diagnostics.push(
          diagnostic(path, "unresolved-heritage", base.line, `Unresolved base type: ${base.name}`),
        );
    }
    for (const call of data.calls) {
      const resolved = resolveCall(path, call);
      if (
        resolved?.confidence === "exact" &&
        (recoveryPaths.has(path) || recoveryPaths.has(fileById.get(resolved.target.fileId)?.path ?? ""))
      )
        resolved.confidence = "likely";
      if (resolved) {
        if (call.shadowed) {
          const owner = symbols.get(call.from);
          if (owner) owner.metrics.dynamicCalls = Math.max(0, owner.metrics.dynamicCalls - 1);
        }
        addEdge(call.from, resolved.target.id, "calls", resolved.confidence, call.line, call.callee);
        if (file.role === "test")
          addEdge(call.from, resolved.target.id, "tests", resolved.confidence, call.line, call.callee);
        if (call.from === resolved.target.id && resolved.confidence === "exact")
          symbols.get(call.from)?.traits.push("recursive");
      } else {
        graph.diagnostics.push(
          diagnostic(
            path,
            call.dynamic || call.shadowed ? "dynamic-call" : "unresolved-call",
            call.line,
            `No static callee: ${call.callee.slice(0, 160)}`,
          ),
        );
        const owner = symbols.get(call.from);
        if (owner && !call.dynamic && !call.shadowed && call.receiver) owner.metrics.dynamicCalls++;
      }
      const owner = symbols.get(call.from);
      if (
        owner &&
        config.ioApis.some((api) =>
          api.endsWith(".") ? call.callee.startsWith(api) : call.callee === api || call.callee.startsWith(api),
        )
      )
        owner.traits.push("does-io");
    }
    if (file.role === "test")
      for (const imp of data.imports)
        for (const binding of imp.bindings) {
          const targetPath = resolutions.get(path)?.get(imp);
          const target = targetPath ? exported(targetPath, binding.imported) : null;
          if (target) addEdge(file.id, target.id, "tests", "exact", imp.line, binding.local);
        }
    for (const fact of data.facts) {
      const resolved = resolveCall(path, {
        from: file.id,
        callee: fact.callee,
        receiver: fact.callee.includes(".") ? (fact.callee.split(".")[0] ?? null) : null,
        property: fact.callee.includes(".") ? (fact.callee.split(".").at(-1) ?? null) : null,
        dynamic: false,
        line: fact.line,
        shadowed: false,
      });
      if (
        resolved?.confidence === "exact" &&
        !recoveryPaths.has(path) &&
        !recoveryPaths.has(fileById.get(resolved.target.fileId)?.path ?? "")
      )
        graph.testFacts.push({
          id: id(path, "assertion", `${fact.line}:${fact.callee}:${JSON.stringify(fact.args)}`),
          testFileId: file.id,
          line: fact.line,
          calleeSymbolId: resolved.target.id,
          args: fact.args,
          expected: fact.expected,
          matcher: fact.matcher,
        });
      else
        graph.diagnostics.push(
          diagnostic(path, "assertion-unresolved", fact.line, "Literal assertion has no exact callee binding."),
        );
    }
    for (const entry of data.entries) {
      if (!entry.symbolId) {
        const call = data.calls.find((c) => c.line === entry.range.startLine);
        const target = call?.callee;
        const handler = sourceByPath
          .get(path)
          ?.text.split("\n")
          [entry.range.startLine - 1]?.match(/,\s*(\w+)\s*\)/)?.[1];
        if (handler) {
          const resolved = resolveCall(path, {
            from: file.id,
            callee: handler,
            receiver: null,
            property: null,
            dynamic: false,
            line: entry.range.startLine,
            shadowed: false,
          });
          entry.symbolId = resolved?.target.id ?? null;
        }
        if (target && entry.kind === "event" && entry.symbolId)
          symbols.get(entry.symbolId)?.traits.push("event-handler");
      }
      graph.entryPoints.push(entry);
    }
  }
  for (const source of sources.filter((s) => s.path.endsWith("package.json")))
    try {
      const pkg = JSON.parse(source.text) as Record<string, unknown>;
      const targets: string[] = [];
      const collect = (v: unknown) => {
        if (typeof v === "string") targets.push(v);
        else if (v && typeof v === "object") for (const value of Object.values(v)) collect(value);
      };
      collect(pkg.main);
      collect(pkg.bin);
      collect(pkg.exports);
      for (const value of targets) {
        const target = fileAt(posix.join(posix.dirname(source.path), value));
        const file = target ? files.get(target) : null;
        if (file)
          graph.entryPoints.push({
            id: id(file.path, "entry:main", value),
            fileId: file.id,
            symbolId: null,
            kind: "main",
            label: value,
            range: { startLine: 1, endLine: 1, startColumn: 0, endColumn: 0 },
          });
      }
    } catch {
      /* Manifest diagnostic already recorded. */
    }
  for (const symbol of graph.symbols) {
    const outgoing = graph.edges.filter((e) => e.kind === "calls" && e.from === symbol.id);
    symbol.metrics.fanOut = new Set(outgoing.map((e) => e.to)).size;
    symbol.metrics.fanIn = new Set(
      graph.edges.filter((e) => e.kind === "calls" && e.to === symbol.id).map((e) => e.from),
    ).size;
    const file = fileById.get(symbol.fileId);
    const detail = file ? parsed.get(file.path)?.details[symbol.id] : undefined;
    if (
      ["function", "method"].includes(symbol.kind) &&
      !symbol.traits.includes("does-io") &&
      !detail?.writesOuter &&
      !symbol.metrics.dynamicCalls
    )
      symbol.traits.push("pure-candidate");
  }
}
