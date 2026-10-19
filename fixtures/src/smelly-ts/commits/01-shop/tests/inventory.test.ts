import { describe, expect, it } from "vitest";
import { needsRestock } from "../src/inventory/restock";
import { available } from "../src/inventory/stock";
import { lowStockSkus, receive, warehouseFor } from "../src/inventory/warehouse";

describe("inventory", () => {
  it("tracks stock and restocking", () => {
    receive("sku-1", 3);
    expect(available("sku-1")).toBe(3);
    expect(warehouseFor("sku-1").name).toBe("main");
    expect(needsRestock("sku-1", 5)).toBe(true);
    expect(lowStockSkus(5)).toEqual(["sku-1"]);
  });
});
