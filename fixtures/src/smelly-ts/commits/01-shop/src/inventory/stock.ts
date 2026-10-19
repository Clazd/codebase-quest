import { warehouseFor } from "./warehouse";

/** How many units of `sku` are available right now. */
export function available(sku: string): number {
  return warehouseFor(sku).levels.get(sku) ?? 0;
}
