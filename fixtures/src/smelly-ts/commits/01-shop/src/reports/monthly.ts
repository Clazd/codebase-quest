import type { Order } from "../types";

/** Total revenue of the orders placed in `month` (e.g. "2025-02"). */
export function monthlyRevenue(orders: Order[], month: string): number {
  let total = 0;
  for (const order of orders) {
    if (order.month === month) {
      total += order.subtotal;
    }
  }
  return total;
}
