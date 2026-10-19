/** Runtime guard for validated references, bounded indices and required DOM elements. */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Required world data or UI element is missing");
  return value;
}
