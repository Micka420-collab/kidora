import { describe, it, expect } from "vitest";
import { todayWeekday, isWithinWindow, isBedtimeNow, WEEKDAYS_ORDER } from "./schedule";

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
