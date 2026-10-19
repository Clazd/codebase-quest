import { writeFileSync } from "node:fs";
import type { Order } from "../types";

/** Saves an order as JSON. */
export function saveOrder(order: Order, path: string): void {
  try {
    writeFileSync(path, JSON.stringify(order));
  } catch (error) {}
}
