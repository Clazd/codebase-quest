import { afterEach, describe, expect, it, vi } from "vitest";
import { keyToDirection, VirtualKeys, velocityFor } from "./movement.ts";

describe("movement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps arrow keys and WASD", () => {
    expect(keyToDirection("ArrowRight")).toBe("right");
    expect(keyToDirection("w")).toBe("up");
    expect(keyToDirection("D")).toBe("right");
    expect(keyToDirection("Enter")).toBeUndefined();
  });

  it("moves in four directions only", () => {
    expect(velocityFor(new Set(["right"]), 80)).toEqual({ x: 80, y: 0 });
    expect(velocityFor(new Set(["up"]), 80)).toEqual({ x: 0, y: -80 });
    expect(velocityFor(new Set(["up", "left"]), 80)).toEqual({ x: -80, y: 0 });
    expect(velocityFor(new Set(["left", "right"]), 80)).toEqual({ x: 0, y: 0 });
    expect(velocityFor(new Set(), 80)).toEqual({ x: 0, y: 0 });
  });

  it("holds a virtual key for the given time", async () => {
    vi.useFakeTimers();
    const keys = new VirtualKeys();
    const done = keys.press("ArrowRight", 500);
    expect([...keys.held()]).toEqual(["right"]);
    await vi.advanceTimersByTimeAsync(499);
    expect([...keys.held()]).toEqual(["right"]);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect([...keys.held()]).toEqual([]);
  });

  it("rejects unknown keys", async () => {
    await expect(new VirtualKeys().press("Enter", 10)).rejects.toThrow('Unsupported key "Enter"');
  });
});
