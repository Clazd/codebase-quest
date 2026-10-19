import type { CartItem } from "../types";

/** Sums the price of every line in the cart. */
export function cartTotal(items: CartItem[]): number {
  // FIXME: 3-for-2 deals are applied per line, not per product
  let total = 0;
  for (const item of items) {
    total += item.unitPrice * item.quantity;
  }
  return total;
}
