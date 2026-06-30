import { describe, it, expect } from "vitest";
import { hourHistogram, peakHour } from "./hourly";

describe("hourHistogram", () => {
  it("returns 24 zero buckets for no data", () => {
    const h = hourHistogram([]);
    expect(h).toHaveLength(24);
    expect(h.every((n) => n === 0)).toBe(true);
  });
  it("counts by UTC hour with no offset (default)", () => {
    const h = hourHistogram([
      new Date("2026-06-30T08:15:00Z"),
      new Date("2026-06-30T08:59:00Z"),
      new Date("2026-06-30T20:00:00Z"),
    ]);
    expect(h[8]).toBe(2);
    expect(h[20]).toBe(1);
    expect(h[0]).toBe(0);
  });
  it("accepts ISO strings", () => {
    expect(hourHistogram(["2026-06-30T14:30:00Z"])[14]).toBe(1);
  });
  it("shifts buckets by a positive offset (UTC+2)", () => {
    const h = hourHistogram(["2026-06-30T08:15:00Z", "2026-06-30T20:00:00Z"], 120);
    expect(h[10]).toBe(1); // 08:15Z → 10:15
    expect(h[22]).toBe(1); // 20:00Z → 22:00
    expect(h[8]).toBe(0);
  });
  it("wraps across midnight for offsets (forward and back)", () => {
    expect(hourHistogram(["2026-06-30T23:30:00Z"], 120)[1]).toBe(1); // → 01:30 next day
    expect(hourHistogram(["2026-06-30T00:30:00Z"], -120)[22]).toBe(1); // → 22:30 prev day
  });
  it("skips unparseable timestamps without throwing", () => {
    const h = hourHistogram(["not-a-date", "2026-06-30T05:00:00Z"]);
    expect(h[5]).toBe(1);
    expect(h.reduce((a, b) => a + b, 0)).toBe(1);
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
