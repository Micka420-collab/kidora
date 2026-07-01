import { describe, it, expect } from "vitest";
import { buildAiSummaryInput } from "./ai-summary-input";
import type { ChildReport } from "./report";

function makeReport(overrides: Partial<ChildReport> = {}): ChildReport {
  return {
    days: 7,
    totalSeconds: 3 * 3600, // 180 min
    avgPerDaySeconds: 30 * 60, // 30 min
    trend: [],
    topApps: Array.from({ length: 8 }, (_, i) => ({ appName: `App ${i}`, category: "games", seconds: (i + 1) * 60 })),
    byCategory: Array.from({ length: 7 }, (_, i) => ({ category: `cat${i}`, seconds: (i + 1) * 60 })),
    web: { totalVisits: 120, blockedVisits: 4, topDomains: [] },
    alerts: { total: 3, byType: [{ type: "risk", count: 2 }, { type: "geofence", count: 1 }] },
    ...overrides,
  };
}

describe("buildAiSummaryInput (aggregate-only, privacy-safe)", () => {
  it("converts seconds to minutes and labels the period", () => {
    const d = buildAiSummaryInput("Léa", makeReport(), 7);
    expect(d.enfant).toBe("Léa");
    expect(d.periode).toBe("7 derniers jours");
    expect(d.tempsEcran).toEqual({ totalMin: 180, moyenneParJourMin: 30 });
    expect(d.web).toEqual({ visites: 120, bloquees: 4 });
  });

  it("caps top apps and categories at 5", () => {
    const d = buildAiSummaryInput("Léa", makeReport(), 7);
    expect(d.topApps).toHaveLength(5);
    expect(d.topCategories).toHaveLength(5);
    expect(d.topApps[0]).toEqual({ app: "App 0", minutes: 1 });
  });

  it("maps alert types to human labels and keeps counts", () => {
    const d = buildAiSummaryInput("Léa", makeReport(), 7);
    expect(d.alertes.total).toBe(3);
    expect(d.alertes.parType).toContainEqual({ type: "risques détectés", nombre: 2 });
    expect(d.alertes.parType).toContainEqual({ type: "zones", nombre: 1 });
  });

  it("exposes only aggregates — no message/search/domain content leaks", () => {
    const d = buildAiSummaryInput("Léa", makeReport(), 7);
    const json = JSON.stringify(d);
    expect(json).not.toContain("topDomains");
    // shape is exactly the aggregate keys
    expect(Object.keys(d).sort()).toEqual(
      ["alertes", "categoriesRisque", "enfant", "periode", "tempsEcran", "topApps", "topCategories", "web"],
    );
  });

  it("reflects the requested window length in the period label", () => {
    expect(buildAiSummaryInput("Léa", makeReport(), 14).periode).toBe("14 derniers jours");
  });
});
