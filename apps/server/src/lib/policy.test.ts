import { describe, it, expect } from "vitest";
import { computeScreenTimeToday } from "./policy";

describe("computeScreenTimeToday", () => {
  const st = (dailyLimits: string, enabled = true) => ({ enabled, dailyLimits });

  it("adds today's bonus to the weekday limit", () => {
    const r = computeScreenTimeToday(st(JSON.stringify({ mon: 120 })), 30, "mon");
    expect(r).toEqual({ enabled: true, limitMinutes: 120, bonusMinutes: 30, totalMinutes: 150 });
  });

  it("treats a missing weekday limit as free time (no total even with bonus)", () => {
    const r = computeScreenTimeToday(st(JSON.stringify({ mon: 120 })), 30, "sun");
    expect(r.limitMinutes).toBe(0);
    expect(r.totalMinutes).toBe(0);
  });

  it("returns zeros when screen time is disabled", () => {
    const r = computeScreenTimeToday(st(JSON.stringify({ mon: 120 }), false), 30, "mon");
    expect(r).toEqual({ enabled: false, limitMinutes: 0, bonusMinutes: 0, totalMinutes: 0 });
  });

  it("falls back to no limit on malformed JSON", () => {
    const r = computeScreenTimeToday(st("not-json"), 0, "mon");
    expect(r.limitMinutes).toBe(0);
    expect(r.totalMinutes).toBe(0);
  });

  it("handles a null screen-time row", () => {
    expect(computeScreenTimeToday(null, 15, "mon")).toEqual({
      enabled: false, limitMinutes: 0, bonusMinutes: 0, totalMinutes: 0,
    });
  });

  it("never lets a negative bonus reduce the allowance", () => {
    const r = computeScreenTimeToday(st(JSON.stringify({ tue: 60 })), -99, "tue");
    expect(r.bonusMinutes).toBe(0);
    expect(r.totalMinutes).toBe(60);
  });
});
