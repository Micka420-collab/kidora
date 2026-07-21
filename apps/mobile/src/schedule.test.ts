import { isBedtimeNow, nextBedtimeStart, type TimeWindow } from "./schedule";

// A fixed reference: 2026-07-15 is a Wednesday.
const wed = (h: number, m = 0) => new Date(2026, 6, 15, h, m, 0);

describe("isBedtimeNow", () => {
  it("is false with no windows", () => {
    expect(isBedtimeNow(undefined, wed(22))).toBe(false);
    expect(isBedtimeNow([], wed(22))).toBe(false);
  });

  it("matches a same-day window on the right weekday", () => {
    const w: TimeWindow = { days: ["wed"], start: "13:00", end: "14:00" };
    expect(isBedtimeNow([w], wed(13, 30))).toBe(true);
    expect(isBedtimeNow([w], wed(14, 1))).toBe(false); // end is exclusive
    expect(isBedtimeNow([w], wed(12, 59))).toBe(false);
  });

  it("ignores a window scoped to other days", () => {
    const w: TimeWindow = { days: ["mon"], start: "13:00", end: "14:00" };
    expect(isBedtimeNow([w], wed(13, 30))).toBe(false);
  });

  it("empty days = every day", () => {
    const w: TimeWindow = { days: [], start: "13:00", end: "14:00" };
    expect(isBedtimeNow([w], wed(13, 30))).toBe(true);
  });

  it("handles an overnight window (start > end)", () => {
    const w: TimeWindow = { days: [], start: "21:00", end: "07:00" };
    expect(isBedtimeNow([w], wed(22))).toBe(true); // evening side
    expect(isBedtimeNow([w], wed(6))).toBe(true); //  morning side (before end)
    expect(isBedtimeNow([w], wed(8))).toBe(false); // daytime
  });

  it("overnight window honours the weekday of the EVENING it starts", () => {
    // A wed-scoped 21:00→07:00 window covers Wed evening but not Wed 06:00
    // (that morning belongs to the Tue window).
    const w: TimeWindow = { days: ["wed"], start: "21:00", end: "07:00" };
    expect(isBedtimeNow([w], wed(22))).toBe(true);
    expect(isBedtimeNow([w], wed(6))).toBe(false);
  });
});

describe("nextBedtimeStart", () => {
  it("returns the earliest upcoming start today", () => {
    const windows: TimeWindow[] = [
      { days: [], start: "21:00", end: "07:00" },
      { days: [], start: "14:00", end: "15:00" },
    ];
    expect(nextBedtimeStart(windows, wed(12))).toBe("14:00"); // 14:00 is sooner than 21:00
  });

  it("returns null when nothing starts later today", () => {
    const windows: TimeWindow[] = [{ days: [], start: "09:00", end: "10:00" }];
    expect(nextBedtimeStart(windows, wed(12))).toBeNull();
  });

  it("skips windows scoped to other weekdays", () => {
    const windows: TimeWindow[] = [{ days: ["mon"], start: "21:00", end: "22:00" }];
    expect(nextBedtimeStart(windows, wed(12))).toBeNull();
  });

  it("zero-pads the label", () => {
    const windows: TimeWindow[] = [{ days: [], start: "9:05", end: "10:00" }];
    expect(nextBedtimeStart(windows, wed(8))).toBe("09:05");
  });
});
