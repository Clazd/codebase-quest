/** Pure migration of the early development envelope. The Phase 05 Codex is imported by the browser adapter. */
export function migrateLegacy(value: unknown): unknown {
  if (value && typeof value === "object" && "saveVersion" in value && value.saveVersion === 0) {
    const { saveVersion: _version, ...rest } = value;
    return { ...rest, saveVersion: 1 };
  }
  return value;
}
