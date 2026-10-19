export type Row = { id: string };

const tables = new Map<string, Row[]>();
let openBatches = 0;

function table(name: string): Row[] {
  let rows = tables.get(name);
  if (!rows) {
    rows = [];
    tables.set(name, rows);
  }
  return rows;
}

/** Returns every row of `name` whose fields equal all fields of `where`. */
export function query<T extends Row>(name: string, where: Partial<T> = {}): T[] {
  const entries = Object.entries(where);
  return (table(name) as T[]).filter((row) =>
    entries.every(([key, value]) => (row as Record<string, unknown>)[key] === value),
  );
}

export function insert<T extends Row>(name: string, row: T): T {
  table(name).push(row);
  return row;
}

export function update<T extends Row>(name: string, id: string, patch: Partial<T>): T | undefined {
  const row = table(name).find((r) => r.id === id) as T | undefined;
  if (row) Object.assign(row, patch);
  return row;
}

/** Groups writes for the logs. Writes still apply immediately. */
export function beginBatch(): { end(): void } {
  openBatches += 1;
  return {
    end() {
      openBatches -= 1;
    },
  };
}

/** Loads tables from a JSON snapshot. A broken snapshot leaves the store as it was. */
export function loadSnapshot(json: string): void {
  try {
    const data = JSON.parse(json) as Record<string, Row[]>;
    for (const [name, rows] of Object.entries(data)) tables.set(name, rows);
  } catch (error) {
  }
}
