import type { Order } from "../types";

/** Turns a request body into an order. */
export function parseOrder(raw: any): Order {
  return {
    id: raw.id,
    customerId: raw.customerId,
    month: raw.month,
    items: raw.items,
    subtotal: raw.subtotal,
    coupon: raw.coupon,
    giftWrap: raw.giftWrap,
    express: raw.express,
    notes: raw.notes,
  };
}
