import { describe, expect, it } from "vitest";
import { parseOrder } from "../src/api/parse";
import { cartTotal } from "../src/cart/cartTotal";
import { applyCoupon } from "../src/cart/coupon";
import { formatMoney } from "../src/format/money";
import { formatPrice } from "../src/format/price";
import { createOrder } from "../src/orders/createOrder";
import { orderSummary } from "../src/orders/orders";
import { addTax } from "../src/orders/tax";
import { registerHook, runHook } from "../src/plugins/hooks";
import { discountRate } from "../src/pricing/discount";
import { shippingLabel } from "../src/shipping/label";
import { saveOrder } from "../src/storage/save";
import type { Order } from "../src/types";

function order(): Order {
  return {
    id: "o1",
    customerId: "c1",
    month: "2025-02",
    items: [],
    subtotal: 1000,
    coupon: null,
    giftWrap: false,
    express: false,
    notes: [],
  };
}

describe("cart", () => {
  it("sums the lines", () => {
    expect(cartTotal([{ sku: "a", unitPrice: 250, quantity: 2, clearance: false }])).toBe(500);
  });

  it("applies coupons", () => {
    expect(applyCoupon(1000, 15)).toBe(850);
    expect(applyCoupon(999, 10)).toBe(900);
  });
});

describe("pricing", () => {
  it("gives VIPs and members a discount", () => {
    expect(discountRate(order(), { id: "c1", tier: "vip", birthday: "01-01" }, "02-02")).toBe(0.2);
    expect(discountRate(order(), { id: "c1", tier: "member", birthday: "01-01" }, "02-02")).toBe(0.1);
    expect(discountRate(order(), { id: "c1", tier: "guest", birthday: "01-01" }, "02-02")).toBe(0);
  });
});

describe("formatting", () => {
  it("formats money", () => {
    expect(formatMoney(123456, "$")).toBe("$1,234.56");
    expect(formatMoney(-5, "€")).toBe("-€0.05");
  });

  it("formats prices", () => {
    expect(formatPrice(1020, "$")).toBe("$10.20");
  });
});

describe("orders", () => {
  it("summarizes an order", () => {
    expect(orderSummary(order())).toBe("o1: 0 item(s) for c1");
  });

  it("adds tax", () => {
    expect(addTax(2000)).toBe(2195);
  });

  it("creates orders", () => {
    const address = { name: "Ada", country: "NL", region: "NH", lines: ["Main St 1"] };
    const created = createOrder("c1", [], address, null, false, [], false, "2025-02");
    expect(created.subtotal).toBe(0);
    expect(created.notes).toEqual(["Ada"]);
  });

  it("parses request bodies", () => {
    expect(parseOrder(order())).toEqual(order());
  });

  it("saves orders without throwing", () => {
    expect(() => saveOrder(order(), "/no/such/folder/order.json")).not.toThrow();
  });
});

describe("hooks", () => {
  it("runs a registered hook", () => {
    const target = order();
    registerHook("note", (o) => o.notes.push("hooked"));
    runHook("note", target);
    expect(target.notes).toEqual(["hooked"]);
  });
});

describe("shipping", () => {
  it("prints the non-empty address lines", () => {
    const address = { name: "Ada", country: "NL", region: "NH", lines: ["Main St 1", " "] };
    expect(shippingLabel(order(), address)).toBe("Ada\nMain St 1");
  });
});
