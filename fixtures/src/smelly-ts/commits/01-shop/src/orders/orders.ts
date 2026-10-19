import type { Order } from "../types";

/** One line describing an order, for logs and emails. */
export function orderSummary(order: Order): string {
  return `${order.id}: ${order.items.length} item(s) for ${order.customerId}`;
}

function legacyOrderCode(order: Order): string {
  return order.id.toUpperCase();
}
