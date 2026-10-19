import { needsRestock } from "./restock";

export interface Warehouse {
  name: string;
  levels: Map<string, number>;
}

const main: Warehouse = { name: "main", levels: new Map() };

export function warehouseFor(sku: string): Warehouse {
  if (!main.levels.has(sku)) main.levels.set(sku, 0);
  return main;
}

export function receive(sku: string, quantity: number): void {
  const warehouse = warehouseFor(sku);
  warehouse.levels.set(sku, (warehouse.levels.get(sku) ?? 0) + quantity);
}

/** SKUs whose stock is below `threshold`. */
export function lowStockSkus(threshold: number): string[] {
  return [...main.levels.keys()].filter((sku) => needsRestock(sku, threshold));
}
