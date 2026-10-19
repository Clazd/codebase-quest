import { cartTotal } from "../cart/cartTotal";
import type { Address, CartItem, Coupon, Order } from "../types";

let nextOrder = 1;

/** Creates an order from a cart. */
export function createOrder(
  customerId: string,
  items: CartItem[],
  address: Address,
  coupon: Coupon | null,
  giftWrap: boolean,
  notes: string[],
  express: boolean,
  month: string,
): Order {
  const order: Order = {
    id: `order-${nextOrder}`,
    customerId,
    month,
    items,
    subtotal: cartTotal(items),
    coupon,
    giftWrap,
    express,
    notes: [...notes, address.name],
  };
  nextOrder += 1;
  return order;
}
