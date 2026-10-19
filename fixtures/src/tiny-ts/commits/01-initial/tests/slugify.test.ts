import { describe, expect, it } from "vitest";
import { slugify } from "../src/utils/slugify";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims spaces", () => {
    expect(slugify("  Taskly  ")).toBe("taskly");
  });

  it("drops punctuation", () => {
    expect(slugify("Ship it!!")).toBe("ship-it");
    expect(slugify("C++ & Rust")).toBe("c-rust");
  });
});
