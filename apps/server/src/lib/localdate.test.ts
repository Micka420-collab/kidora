import { describe, it, expect } from "vitest";
import { localDateString, localDateStringDaysAgo, clampTzOffset } from "./localdate";

describe("localDateString", () => {
  it("returns the UTC date with no offset", () => {
    expect(localDateString(Date.UTC(2026, 6, 1, 12, 0, 0), 0)).toBe("2026-07-01");
  });

  it("rolls forward past midnight for a positive offset (UTC+2)", () => {
    // 2026-06-30 23:00 UTC → 01:00 local on Jul 1
    expect(localDateString(Date.UTC(2026, 5, 30, 23, 0, 0), 120)).toBe("2026-07-01");
  });

  it("rolls back before midnight for a negative offset (UTC-5)", () => {
    // 2026-07-01 02:00 UTC → 21:00 local on Jun 30
    expect(localDateString(Date.UTC(2026, 6, 1, 2, 0, 0), -300)).toBe("2026-06-30");
  });

  it("keeps the same date mid-day regardless of a small offset", () => {
    expect(localDateString(Date.UTC(2026, 6, 1, 12, 0, 0), 120)).toBe("2026-07-01");
    expect(localDateString(Date.UTC(2026, 6, 1, 12, 0, 0), -300)).toBe("2026-07-01");
  });
});

describe("localDateStringDaysAgo", () => {
  it("subtracts whole days in the given tz", () => {
    const now = Date.UTC(2026, 6, 1, 12, 0, 0);
    expect(localDateStringDaysAgo(now, 0, 120)).toBe("2026-07-01");
    expect(localDateStringDaysAgo(now, 1, 120)).toBe("2026-06-30");
    expect(localDateStringDaysAgo(now, 7, 120)).toBe("2026-06-24");
  });
});

describe("clampTzOffset", () => {
  it("passes valid offsets through (truncated to whole minutes)", () => {
    expect(clampTzOffset(120)).toBe(120);
    expect(clampTzOffset(-300)).toBe(-300);
    expect(clampTzOffset(0)).toBe(0);
    expect(clampTzOffset(59.9)).toBe(59);
  });
  it("clamps to ±840 minutes (±14h)", () => {
    expect(clampTzOffset(99999)).toBe(840);
    expect(clampTzOffset(-99999)).toBe(-840);
  });
  it("defaults non-finite / junk to 0", () => {
    expect(clampTzOffset("abc")).toBe(0);
    expect(clampTzOffset(undefined)).toBe(0);
    expect(clampTzOffset(null)).toBe(0);
    expect(clampTzOffset(NaN)).toBe(0);
    expect(clampTzOffset("120")).toBe(120); // numeric string ok
  });
});
