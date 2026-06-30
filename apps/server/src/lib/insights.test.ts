import { describe, it, expect } from "vitest";
import { buildInsights, type InsightsInput } from "./insights";

const base: InsightsInput = {
  thisWeekSeconds: 3600,
  lastWeekSeconds: 0,
  topCategory: null,
  busiestDay: null,
  alertsThisWeek: 0,
};

describe("buildInsights", () => {
  it("always includes screenTime and alerts", () => {
    const keys = buildInsights(base).map((i) => i.key);
    expect(keys).toContain("screenTime");
    expect(keys).toContain("alerts");
  });

  it("leaves delta null when there is no prior week", () => {
    const st = buildInsights(base).find((i) => i.key === "screenTime");
    expect(st).toMatchObject({ key: "screenTime", deltaPct: null, direction: "flat" });
  });

  it("computes an upward delta past the flat threshold", () => {
    const st = buildInsights({ ...base, thisWeekSeconds: 200, lastWeekSeconds: 100 }).find((i) => i.key === "screenTime");
    expect(st).toMatchObject({ deltaPct: 100, direction: "up" });
  });

  it("computes a downward delta", () => {
    const st = buildInsights({ ...base, thisWeekSeconds: 50, lastWeekSeconds: 100 }).find((i) => i.key === "screenTime");
    expect(st).toMatchObject({ deltaPct: -50, direction: "down" });
  });

  it("treats a small change as flat", () => {
    const st = buildInsights({ ...base, thisWeekSeconds: 101, lastWeekSeconds: 100 }).find((i) => i.key === "screenTime");
    expect(st).toMatchObject({ direction: "flat" });
  });

  it("omits topCategory/busiestDay when empty, includes them when present", () => {
    expect(buildInsights(base).map((i) => i.key)).not.toContain("topCategory");
    const withData = buildInsights({
      ...base,
      topCategory: { category: "games", seconds: 1200 },
      busiestDay: { date: "2026-06-29", seconds: 5000 },
    });
    expect(withData.map((i) => i.key)).toEqual(["screenTime", "topCategory", "busiestDay", "alerts"]);
  });

  it("ignores zero-second category/day", () => {
    const r = buildInsights({ ...base, topCategory: { category: "games", seconds: 0 } });
    expect(r.map((i) => i.key)).not.toContain("topCategory");
  });
});
