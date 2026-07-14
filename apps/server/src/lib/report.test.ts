import { describe, it, expect } from "vitest";
import { aggregateReport, dateStr, resolveReportTz } from "./report";

describe("resolveReportTz", () => {
  it("uses the tz query param when present and valid", () => {
    expect(resolveReportTz("120", -480)).toBe(120);
    expect(resolveReportTz("-300", 0)).toBe(-300);
    expect(resolveReportTz("0", -480)).toBe(0); // an explicit UTC request is honoured
  });

  it("falls back to the child offset when tz is ABSENT (the mobile-app bug)", () => {
    // Number(null) is 0 (finite), so a null param must NOT be treated as "UTC".
    expect(resolveReportTz(null, -480)).toBe(-480);
    expect(resolveReportTz(null, 120)).toBe(120);
  });

  it("falls back to the child offset when tz is unparseable junk", () => {
    expect(resolveReportTz("abc", -480)).toBe(-480);
  });

  it("clamps both sources to ±14h and treats a missing child offset as UTC", () => {
    expect(resolveReportTz("99999", 0)).toBe(840);
    expect(resolveReportTz(null, -99999)).toBe(-840);
    expect(resolveReportTz(null, null)).toBe(0);
    expect(resolveReportTz(null, undefined)).toBe(0);
  });
});

const dates = ["2026-06-28", "2026-06-29", "2026-06-30"];

describe("dateStr (local-day bucketing)", () => {
  // 2026-07-01T01:30:00Z — a moment where UTC and some offsets disagree on the day.
  const at = Date.UTC(2026, 6, 1, 1, 30); // month 6 = July

  it("uses UTC when no offset given", () => {
    expect(dateStr(0, 0, at)).toBe("2026-07-01");
    expect(dateStr(1, 0, at)).toBe("2026-06-30");
  });

  it("rolls the day back for a negative (west) offset", () => {
    // UTC-5: local is 2026-06-30T20:30 → still the previous day
    expect(dateStr(0, -300, at)).toBe("2026-06-30");
  });

  it("keeps the day for a positive (east) offset", () => {
    // UTC+2: local is 2026-07-01T03:30
    expect(dateStr(0, 120, at)).toBe("2026-07-01");
    expect(dateStr(1, 120, at)).toBe("2026-06-30");
  });
});

describe("aggregateReport", () => {
  it("returns zeros for empty input", () => {
    const r = aggregateReport({ usage: [], visits: [], alerts: [], dates, days: 3 });
    expect(r.totalSeconds).toBe(0);
    expect(r.avgPerDaySeconds).toBe(0);
    expect(r.trend).toEqual(dates.map((d) => ({ date: d, seconds: 0 })));
    expect(r.topApps).toEqual([]);
    expect(r.web).toEqual({ totalVisits: 0, blockedVisits: 0, topDomains: [] });
    expect(r.alerts).toEqual({ total: 0, byType: [] });
  });

  it("sums screen time per day and overall, computes the daily average", () => {
    const r = aggregateReport({
      usage: [
        { date: "2026-06-28", appId: "yt", appName: "YouTube", category: "video", seconds: 600 },
        { date: "2026-06-28", appId: "rbx", appName: "Roblox", category: "games", seconds: 300 },
        { date: "2026-06-30", appId: "yt", appName: "YouTube", category: "video", seconds: 1200 },
      ],
      visits: [], alerts: [], dates, days: 3,
    });
    expect(r.totalSeconds).toBe(2100);
    expect(r.avgPerDaySeconds).toBe(700);
    expect(r.trend).toEqual([
      { date: "2026-06-28", seconds: 900 },
      { date: "2026-06-29", seconds: 0 },
      { date: "2026-06-30", seconds: 1200 },
    ]);
  });

  it("ranks top apps by total seconds and merges same app across days", () => {
    const r = aggregateReport({
      usage: [
        { date: "2026-06-28", appId: "yt", appName: "YouTube", category: "video", seconds: 600 },
        { date: "2026-06-30", appId: "yt", appName: "YouTube", category: "video", seconds: 1200 },
        { date: "2026-06-29", appId: "rbx", appName: "Roblox", category: "games", seconds: 1000 },
      ],
      visits: [], alerts: [], dates, days: 3,
    });
    expect(r.topApps[0]).toEqual({ appName: "YouTube", category: "video", seconds: 1800 });
    expect(r.topApps[1]).toEqual({ appName: "Roblox", category: "games", seconds: 1000 });
    expect(r.byCategory[0]).toEqual({ category: "video", seconds: 1800 });
  });

  it("falls back to 'unknown' category", () => {
    const r = aggregateReport({
      usage: [{ date: "2026-06-28", appId: "x", appName: "X", category: null, seconds: 60 }],
      visits: [], alerts: [], dates, days: 3,
    });
    expect(r.byCategory).toEqual([{ category: "unknown", seconds: 60 }]);
  });

  it("counts web visits, blocked, and ranks top domains", () => {
    const r = aggregateReport({
      usage: [], dates, days: 3,
      visits: [
        { domain: "youtube.com", blocked: false },
        { domain: "youtube.com", blocked: false },
        { domain: "tiktok.com", blocked: true },
      ],
      alerts: [],
    });
    expect(r.web.totalVisits).toBe(3);
    expect(r.web.blockedVisits).toBe(1);
    expect(r.web.topDomains[0]).toEqual({ domain: "youtube.com", count: 2, blocked: 0 });
    expect(r.web.topDomains[1]).toEqual({ domain: "tiktok.com", count: 1, blocked: 1 });
  });

  it("tallies alerts by type", () => {
    const r = aggregateReport({
      usage: [], visits: [], dates, days: 3,
      alerts: [{ type: "risk" }, { type: "risk" }, { type: "geofence" }],
    });
    expect(r.alerts.total).toBe(3);
    expect(r.alerts.byType).toContainEqual({ type: "risk", count: 2 });
    expect(r.alerts.byType).toContainEqual({ type: "geofence", count: 1 });
  });

  it("caps topApps at 10, ordered by total seconds desc", () => {
    const usage = Array.from({ length: 14 }, (_, i) => ({
      date: "2026-06-28", appId: `app${i}`, appName: `App ${i}`, category: "games", seconds: (i + 1) * 60,
    }));
    const r = aggregateReport({ usage, visits: [], alerts: [], dates, days: 3 });
    expect(r.topApps).toHaveLength(10);
    // highest first (app13 = 14*60), strictly decreasing
    expect(r.topApps[0].appName).toBe("App 13");
    const secs = r.topApps.map((a) => a.seconds);
    expect([...secs].sort((a, b) => b - a)).toEqual(secs);
  });

  it("caps topDomains at 10, ordered by visit count desc", () => {
    const visits = Array.from({ length: 12 }).flatMap((_, i) =>
      Array.from({ length: i + 1 }, () => ({ domain: `d${i}.com`, blocked: false })),
    );
    const r = aggregateReport({ usage: [], visits, alerts: [], dates, days: 3 });
    expect(r.web.topDomains).toHaveLength(10);
    expect(r.web.topDomains[0].domain).toBe("d11.com"); // 12 visits, the most
    const counts = r.web.topDomains.map((d) => d.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("rounds the daily average", () => {
    const r = aggregateReport({
      usage: [{ date: "2026-06-28", appId: "x", appName: "X", category: null, seconds: 100 }],
      visits: [], alerts: [], dates, days: 3,
    });
    expect(r.totalSeconds).toBe(100);
    expect(r.avgPerDaySeconds).toBe(33); // round(100/3)
  });
});
