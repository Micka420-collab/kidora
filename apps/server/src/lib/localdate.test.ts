import { describe, it, expect } from "vitest";
import { localDateString, localDateStringDaysAgo, startOfLocalDayMs, clampTzOffset } from "./localdate";

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

describe("startOfLocalDayMs", () => {
  it("is UTC midnight with no offset", () => {
    expect(startOfLocalDayMs("2026-07-01", 0)).toBe(Date.UTC(2026, 6, 1, 0, 0, 0));
  });

  it("accounts for a positive offset (UTC+2: local midnight is 22:00 UTC the day before)", () => {
    expect(startOfLocalDayMs("2026-07-01", 120)).toBe(Date.UTC(2026, 5, 30, 22, 0, 0));
  });

  it("accounts for a negative offset (UTC-5: local midnight is 05:00 UTC)", () => {
    expect(startOfLocalDayMs("2026-07-01", -300)).toBe(Date.UTC(2026, 6, 1, 5, 0, 0));
  });

  it("is the exact inverse of localDateString (round-trip: start of day maps back to the day, one ms earlier doesn't)", () => {
    for (const tz of [0, 120, -300, 840, -840]) {
      const start = startOfLocalDayMs("2026-07-01", tz);
      expect(localDateString(start, tz)).toBe("2026-07-01");
      expect(localDateString(start + 86_400_000 - 1, tz)).toBe("2026-07-01"); // last ms of the day
      expect(localDateString(start - 1, tz)).toBe("2026-06-30"); // one ms before → previous day
    }
  });

  it("bounds a report window to exactly `days` civil days, not `days*24h` from now", () => {
    // Regression: the report queried visits/alerts from `now - days*24h`, which
    // for a 20:00 request reached ~1 day further back than the usage trend.
    const nowMs = Date.UTC(2026, 6, 8, 20, 0, 0); // request at 20:00 UTC
    const days = 7;
    const tz = 0;
    const firstDay = localDateStringDaysAgo(nowMs, days - 1, tz); // 2026-07-02
    const since = startOfLocalDayMs(firstDay, tz);
    // The window starts at local midnight of the first day shown …
    expect(since).toBe(Date.UTC(2026, 6, 2, 0, 0, 0));
    // … which is strictly LATER than the old `now - days*24h` (2026-07-01 20:00),
    // i.e. the old window leaked ~28h of extra visits/alerts.
    expect(since).toBeGreaterThan(nowMs - days * 86_400_000);
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
