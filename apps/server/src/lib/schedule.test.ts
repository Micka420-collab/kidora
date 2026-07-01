import { describe, it, expect } from "vitest";
import { todayWeekday, localWeekday, isWithinWindow, isWithinWindowTz, isBedtimeNow, isBedtimeNowTz, WEEKDAYS_ORDER } from "./schedule";

// Reference dates (local): 2026-01-05 = Monday, 01-02 = Friday,
// 01-03 = Saturday, 01-06 = Tuesday.
const mon = (h: number, m = 0) => new Date(2026, 0, 5, h, m);
const fri = (h: number, m = 0) => new Date(2026, 0, 2, h, m);
const sat = (h: number, m = 0) => new Date(2026, 0, 3, h, m);
const tue = (h: number, m = 0) => new Date(2026, 0, 6, h, m);

describe("todayWeekday", () => {
  it("maps dates to weekday keys", () => {
    expect(todayWeekday(mon(12))).toBe("mon");
    expect(todayWeekday(fri(12))).toBe("fri");
    expect(todayWeekday(sat(12))).toBe("sat");
  });
});

describe("localWeekday / isWithinWindowTz (family-local, UTC server)", () => {
  // 2026-01-05T23:30:00Z is a Monday night UTC.
  const monNightUtc = Date.UTC(2026, 0, 5, 23, 30);

  it("localWeekday rolls the day for offsets that cross midnight", () => {
    expect(localWeekday(0, monNightUtc)).toBe("mon"); // UTC: Mon 23:30
    expect(localWeekday(120, monNightUtc)).toBe("tue"); // UTC+2: Tue 01:30
    expect(localWeekday(-300, monNightUtc)).toBe("mon"); // UTC-5: Mon 18:30
  });

  it("evaluates a school-hours window in the family's local time, not UTC", () => {
    // Window 08:00–16:00 on weekdays. At 2026-01-05T14:00Z:
    const at14Utc = Date.UTC(2026, 0, 5, 14, 0);
    const school = { days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "16:00" };
    expect(isWithinWindowTz(school, 0, at14Utc)).toBe(true); // UTC 14:00 → inside
    expect(isWithinWindowTz(school, -480, at14Utc)).toBe(false); // UTC-8 → 06:00 local, before start
    expect(isWithinWindowTz(school, 180, at14Utc)).toBe(false); // UTC+3 → 17:00 local, after end
  });

  it("isBedtimeNowTz matches any window in local time", () => {
    const at22Utc = Date.UTC(2026, 0, 5, 22, 0);
    const night = [{ days: [] as string[], start: "21:00", end: "07:00" }];
    expect(isBedtimeNowTz(night, 0, at22Utc)).toBe(true); // 22:00 local → bedtime
    expect(isBedtimeNowTz(night, -180, at22Utc)).toBe(false); // UTC-3 → 19:00 local, before start
    expect(isBedtimeNowTz([], 0, at22Utc)).toBe(false);
    expect(isBedtimeNowTz(undefined, 0, at22Utc)).toBe(false);
  });
});

describe("isWithinWindow — same-day", () => {
  const school = { days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "16:00" };
  it("inside the window on a listed day", () => expect(isWithinWindow(school, mon(10))).toBe(true));
  it("before start", () => expect(isWithinWindow(school, mon(7))).toBe(false));
  it("end is exclusive", () => expect(isWithinWindow(school, mon(16))).toBe(false));
  it("excluded day", () => expect(isWithinWindow(school, sat(10))).toBe(false));
});

describe("isWithinWindow — overnight (every day)", () => {
  const night = { days: [], start: "21:00", end: "07:00" };
  it("evening", () => expect(isWithinWindow(night, mon(22))).toBe(true));
  it("after midnight", () => expect(isWithinWindow(night, mon(2))).toBe(true));
  it("morning daytime", () => expect(isWithinWindow(night, mon(8))).toBe(false));
  it("start inclusive", () => expect(isWithinWindow(night, mon(21))).toBe(true));
  it("end exclusive", () => expect(isWithinWindow(night, mon(7))).toBe(false));
});

describe("isWithinWindow — overnight with day filter", () => {
  const night = { days: ["sun", "mon", "tue", "wed", "thu"], start: "21:00", end: "07:00" };
  it("evening on a listed day", () => expect(isWithinWindow(night, mon(22))).toBe(true));
  it("evening on excluded day (Fri)", () => expect(isWithinWindow(night, fri(22))).toBe(false));
  it("morning belongs to previous (listed) day", () => expect(isWithinWindow(night, tue(2))).toBe(true));
  it("morning belongs to previous (excluded) day", () => expect(isWithinWindow(night, sat(2))).toBe(false));
});

describe("isBedtimeNow", () => {
  const windows = [{ days: [], start: "21:00", end: "07:00" }];
  it("true when any window matches", () => expect(isBedtimeNow(windows, mon(23))).toBe(true));
  it("false when none match", () => expect(isBedtimeNow(windows, mon(12))).toBe(false));
  it("false for empty/undefined", () => {
    expect(isBedtimeNow([], mon(23))).toBe(false);
    expect(isBedtimeNow(undefined, mon(23))).toBe(false);
  });
});

describe("default `now` argument (uses the real clock)", () => {
  it("todayWeekday() returns a valid weekday key", () => {
    expect(WEEKDAYS_ORDER).toContain(todayWeekday());
  });
  it("isBedtimeNow() runs against the real clock without throwing", () => {
    // Clock-independent: result is a boolean; the empty list is never bedtime.
    expect(typeof isBedtimeNow([{ days: [], start: "00:00", end: "23:59" }])).toBe("boolean");
    expect(isBedtimeNow([])).toBe(false);
  });
});
