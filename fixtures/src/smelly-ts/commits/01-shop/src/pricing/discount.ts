import type { Customer, Order } from "../types";

const VIP = "vip";
const MEMBER = "member";
const GUEST = "guest";
const NO_DISCOUNT = 0;
const VIP_RATE = 0.2;
const MEMBER_RATE = 0.1;
const BULK_ITEMS = 10;
const BULK_RATE = 0.05;
const BIG_ORDER = 50000;
const BIG_ORDER_RATE = 0.05;
const BIRTHDAY_RATE = 0.15;
const COUPON_CAP = 0.25;
const CLEARANCE_RATE = 0.4;
const MAX_RATE = 0.5;
const PERCENT = 100;

/** Works out the discount rate (0 to 0.5) for an order. */
export function discountRate(order: Order, customer: Customer, today: string): number {
  let rate = NO_DISCOUNT;

  if (customer.tier === VIP) {
    rate += VIP_RATE;
  } else if (customer.tier === MEMBER) {
    rate += MEMBER_RATE;
  }

  if (order.items.length >= BULK_ITEMS) {
    rate += BULK_RATE;
  }

  if (order.subtotal >= BIG_ORDER && customer.tier !== GUEST) {
    rate += BIG_ORDER_RATE;
  }

  if (customer.birthday === today) {
    rate += BIRTHDAY_RATE;
  }

  if (order.coupon !== null && !order.coupon.expired) {
    const couponRate = order.coupon.percentOff / PERCENT;
    rate += couponRate > COUPON_CAP ? COUPON_CAP : couponRate;
  }

  for (const item of order.items) {
    if (item.clearance) {
      rate = Math.max(rate, CLEARANCE_RATE);
    }
  }

  if (order.giftWrap || order.express) {
    rate = Math.max(NO_DISCOUNT, rate - BULK_RATE);
  }

  return rate > MAX_RATE ? MAX_RATE : rate;
}
