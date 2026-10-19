import { describe, expect, it } from "vitest";
import { daysBetween, formatDate } from "../src/utils/dates";

describe("dates", () => {
  it("formats timestamps as UTC dates", () => {
    expect(formatDate(0)).toBe("1970-01-01");
    expect(formatDate(1736121600000)).toBe("2025-01-06");
  });

  it("counts whole days", () => {
    expect(daysBetween(0, 172800000)).toBe(2);
  });
});
