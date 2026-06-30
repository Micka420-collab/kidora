import { describe, it, expect } from "vitest";
import { hourHistogram, peakHour } from "./hourly";

describe("hourHistogram", () => {
  it("returns 24 zero buckets for no data", () => {
    const h = hourHistogram([]);
    expect(h).toHaveLength(24);
    expect(h.every((n) => n === 0)).toBe(true);
  });
  it("counts by local hour", () => {
    const h = hourHistogram([
      new Date("2026-06-30T08:15:00"),
      new Date("2026-06-30T08:59:00"),
      new Date("2026-06-30T20:00:00"),
    ]);
    expect(h[8]).toBe(2);
    expect(h[20]).toBe(1);
    expect(h[0]).toBe(0);
  });
  it("accepts ISO strings", () => {
    expect(hourHistogram(["2026-06-30T14:30:00"])[14]).toBe(1);
  });
});

describe("peakHour", () => {
  it("returns null for an all-zero histogram", () => {
    expect(peakHour(new Array(24).fill(0))).toBeNull();
  });
  it("returns the busiest hour", () => {
    const b = new Array(24).fill(0);
    b[19] = 5;
    b[8] = 3;
    expect(peakHour(b)).toBe(19);
  });
});
