import { describe, expect, it } from "vitest";
import { add, isEven } from "../src/math";
import { quoteOfTheDay } from "../src/quotes";

describe("quotebook", () => {
  it("adds numbers", () => {
    expect(add(2, 2)).toBe(4);
  });

  it("knows even numbers", () => {
    expect(isEven(4)).toBe(true);
    expect(isEven(3)).toBe(false);
  });

  it("cycles through the quotes", () => {
    expect(quoteOfTheDay(2)).toBe("Make it work, make it right, make it fast.");
  });
});
