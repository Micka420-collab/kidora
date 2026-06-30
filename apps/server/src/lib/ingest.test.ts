import { describe, it, expect } from "vitest";
import { safeDate } from "./ingest";

describe("safeDate", () => {
  it("parses a valid ISO timestamp", () => {
    expect(safeDate("2026-06-30T08:15:00Z").toISOString()).toBe("2026-06-30T08:15:00.000Z");
  });

  it("falls back to ~now for missing/empty input", () => {
    const before = Date.now();
    const d = safeDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(safeDate("").getTime()).toBeGreaterThanOrEqual(before);
    expect(safeDate(null).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("falls back to ~now for an unparseable timestamp (no Invalid Date)", () => {
    const before = Date.now();
    const d = safeDate("not-a-date");
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("never returns an Invalid Date for garbage that Date() partially accepts", () => {
    for (const bad of ["2026-13-99", "garbage", "🕒", "99999999999999999999"]) {
      expect(Number.isNaN(safeDate(bad).getTime())).toBe(false);
    }
  });
});
