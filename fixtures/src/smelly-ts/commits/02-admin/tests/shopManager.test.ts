import { describe, expect, it } from "vitest";
import { ShopManager } from "../src/core/ShopManager";

describe("ShopManager", () => {
  it("manages users", () => {
    const shop = new ShopManager();
    shop.addUser("u1", "Ada");
    shop.addUser("u2", "Ben");
    shop.renameUser("u2", "Bea");
    expect(shop.findUser("u2")).toBe("Bea");
    expect(shop.exportUsers()).toEqual(["Ada", "Bea"]);
    expect(shop.removeUser("u1")).toBe(true);
    expect(shop.countUsers()).toBe(1);
  });

  it("manages stock", () => {
    const shop = new ShopManager();
    shop.addStock("sku-1", 5);
    shop.removeStock("sku-1", 2);
    expect(shop.stockLevel("sku-1")).toBe(3);
    expect(shop.isInStock("sku-1")).toBe(true);
  });

  it("queues emails", () => {
    const shop = new ShopManager();
    shop.queueEmail("ada@example.com");
    expect(shop.outboxSize()).toBe(1);
    shop.clearOutbox();
    expect(shop.outboxSize()).toBe(0);
  });

  it("records payments", () => {
    const shop = new ShopManager();
    shop.recordPayment(1000);
    shop.refundPayment(250);
    expect(shop.balance()).toBe(750);
    expect(shop.paymentCount()).toBe(2);
  });

  it("keeps an audit log", () => {
    const shop = new ShopManager();
    shop.log("opened");
    shop.log("closed");
    expect(shop.lastLogEntry()).toBe("closed");
    expect(shop.logSize()).toBe(2);
    shop.clearLog();
    expect(shop.logSize()).toBe(0);
  });

  it("resets everything", () => {
    const shop = new ShopManager();
    shop.addUser("u1", "Ada");
    shop.recordPayment(1);
    shop.reset();
    expect(shop.countUsers()).toBe(0);
    expect(shop.balance()).toBe(0);
  });
});
