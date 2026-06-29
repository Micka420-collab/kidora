import { describe, it, expect } from "vitest";
import { renderWeeklyEmail, esc, hasActivity, type ReportItem } from "./report-email";
import type { ChildReport } from "./report";

function makeReport(overrides: Partial<ChildReport> = {}): ChildReport {
  return {
    days: 7,
    totalSeconds: 3 * 3600 + 30 * 60, // 3 h 30
    avgPerDaySeconds: 30 * 60, // 30 min
    trend: [],
    topApps: [
      { appName: "YouTube", category: "video", seconds: 2 * 3600 },
      { appName: "Minecraft", category: "games", seconds: 90 * 60 },
    ],
    byCategory: [{ category: "video", seconds: 2 * 3600 }],
    web: { totalVisits: 120, blockedVisits: 4, topDomains: [] },
    alerts: { total: 2, byType: [{ type: "geofence", count: 2 }] },
    ...overrides,
  };
}

describe("esc", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc('<b>"A&B\'</b>')).toBe("&lt;b&gt;&quot;A&amp;B&#39;&lt;/b&gt;");
  });
});

describe("hasActivity", () => {
  it("is true when there is screen time, web visits or alerts", () => {
    expect(hasActivity(makeReport())).toBe(true);
    expect(hasActivity(makeReport({ totalSeconds: 0, web: { totalVisits: 5, blockedVisits: 0, topDomains: [] }, alerts: { total: 0, byType: [] } }))).toBe(true);
  });
  it("is false when the child did nothing", () => {
    expect(
      hasActivity(makeReport({ totalSeconds: 0, web: { totalVisits: 0, blockedVisits: 0, topDomains: [] }, alerts: { total: 0, byType: [] } })),
    ).toBe(false);
  });
});

describe("renderWeeklyEmail", () => {
  const items: ReportItem[] = [{ childName: "Léa", report: makeReport() }];

  it("includes the parent name, child name and formatted durations", () => {
    const { subject, html, text } = renderWeeklyEmail("Marie", items, 7);
    expect(subject).toContain("7 derniers jours");
    expect(html).toContain("Marie");
    expect(html).toContain("Léa");
    expect(html).toContain("3 h 30 min"); // total screen time
    expect(html).toContain("YouTube");
    expect(text).toContain("# Léa");
    expect(text).toContain("Visites web : 120 (4 bloquées)");
  });

  it("escapes malicious child/app names in the HTML", () => {
    const evil: ReportItem[] = [
      { childName: "<script>x</script>", report: makeReport({ topApps: [{ appName: "<img src=x>", category: null, seconds: 60 }] }) },
    ];
    const { html } = renderWeeklyEmail("P", evil, 7);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("handles a child with no recorded apps", () => {
    const empty: ReportItem[] = [{ childName: "Tom", report: makeReport({ topApps: [] }) }];
    const { html } = renderWeeklyEmail("P", empty, 7);
    expect(html).toContain("Aucune app enregistrée");
  });
});
