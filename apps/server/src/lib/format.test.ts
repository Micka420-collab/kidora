import { describe, it, expect } from "vitest";
import { formatDuration, formatMinutes, relativeTime, formatDate, WEEKDAYS } from "./format";

describe("formatDuration", () => {
  it("handles zero and negative as '0 min'", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(-120)).toBe("0 min");
    expect(formatDuration(NaN)).toBe("0 min");
  });

  it("formats sub-hour durations in minutes (rounded)", () => {
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(90)).toBe("2 min"); // round(1.5)
    expect(formatDuration(1800)).toBe("30 min");
  });

  it("formats whole hours without a minutes part", () => {
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(7200)).toBe("2 h");
  });

  it("formats hours + minutes", () => {
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatDuration(3660)).toBe("1 h 1 min");
  });
});

describe("formatMinutes", () => {
  it("delegates to formatDuration (minutes → seconds)", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
  });
});

describe("relativeTime", () => {
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

  it("returns the dash placeholder for null", () => {
    expect(relativeTime(null)).toBe("—");
  });

  it("says 'à l'instant' for the very recent past", () => {
    expect(relativeTime(new Date())).toBe("à l'instant");
    expect(relativeTime(ago(30))).toBe("à l'instant");
  });

  it("uses minutes, hours then days as the gap grows", () => {
    expect(relativeTime(ago(5 * 60))).toBe("il y a 5 min");
    expect(relativeTime(ago(2 * 3600))).toBe("il y a 2 h");
    expect(relativeTime(ago(3 * 86400))).toBe("il y a 3 j");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(relativeTime(ago(5 * 60).toISOString())).toBe("il y a 5 min");
  });

  it("falls back to a calendar date beyond a week", () => {
    const r = relativeTime(ago(10 * 86400));
    expect(r).not.toMatch(/il y a|à l'instant/);
    expect(r).toMatch(/\d/); // a localized date string
  });
});

describe("formatDate", () => {
  it("returns the dash placeholder for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("renders a non-empty localized string for a real date", () => {
    const r = formatDate(new Date("2026-06-30T08:15:00"));
    expect(r).not.toBe("—");
    expect(r).toMatch(/\d/);
  });
});

describe("WEEKDAYS", () => {
  it("has 7 ordered days starting Monday", () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS.map((d) => d.key)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(WEEKDAYS[0]).toEqual({ key: "mon", label: "Lun" });
  });
});
