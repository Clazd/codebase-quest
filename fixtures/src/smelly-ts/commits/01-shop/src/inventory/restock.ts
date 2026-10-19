import { available } from "./stock";

export function needsRestock(sku: string, threshold: number): boolean {
  return available(sku) < threshold;
}
