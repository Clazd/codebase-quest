import { describe, expect, it } from "vitest";
import { computeTaskStatus } from "../src/services/taskService";

describe("computeTaskStatus", () => {
  it("is open without a due date", () => {
    expect(computeTaskStatus({ done: false })).toBe("open");
  });

  it("is done when finished on time", () => {
    expect(computeTaskStatus({ dueDate: 10, done: true, doneAt: 5 })).toBe("done");
  });

  it("is late when finished after the due date", () => {
    expect(computeTaskStatus({ dueDate: 10, done: true, doneAt: 20 })).toBe("late");
  });

  it("is overdue when open past the due date", () => {
    expect(computeTaskStatus({ dueDate: 1, done: false })).toBe("overdue");
  });
});
