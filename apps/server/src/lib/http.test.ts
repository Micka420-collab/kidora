import { describe, it, expect } from "vitest";
import { clampLimit } from "./http";

describe("clampLimit", () => {
  it("uses the default when missing or empty", () => {
    expect(clampLimit(null, 50, 200)).toBe(50);
    expect(clampLimit(undefined, 50, 200)).toBe(50);
    expect(clampLimit("", 50, 200)).toBe(50);
  });

  it("uses the default for non-numeric input (no NaN take)", () => {
    expect(clampLimit("abc", 50, 200)).toBe(50);
    expect(clampLimit("12px", 50, 200)).toBe(50);
  });

  it("clamps to the [min, max] range", () => {
    expect(clampLimit("500", 50, 200)).toBe(200); // over max
    expect(clampLimit("-5", 50, 200)).toBe(1); // negative → min
    expect(clampLimit("0", 50, 200)).toBe(1); // zero → min
    expect(clampLimit("75", 50, 200)).toBe(75); // in range
  });

  it("floors fractional values", () => {
    expect(clampLimit("12.9", 50, 200)).toBe(12);
  });

  it("honours a custom min", () => {
    expect(clampLimit("0", 50, 200, 0)).toBe(0);
  });
});
