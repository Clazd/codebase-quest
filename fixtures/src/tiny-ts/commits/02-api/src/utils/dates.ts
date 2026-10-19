export const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats a timestamp as YYYY-MM-DD in UTC, so every server prints the same date. */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const label = `${year}-${month}-${day}`;
  return label;
}

export function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY_MS);
}
