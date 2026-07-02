import { describe, it, expect } from "vitest";
import { schedulerDecision, buildCronUrl, CRON_PLAN } from "./scheduler";

describe("schedulerDecision", () => {
  it("runs for a self-host Node server with a CRON_SECRET", () => {
    expect(schedulerDecision({ runtime: "nodejs", isVercel: false, secret: "s" }).run).toBe(true);
  });

  it("does NOT run on Vercel (Vercel Cron handles it)", () => {
    expect(schedulerDecision({ runtime: "nodejs", isVercel: true, secret: "s" }).run).toBe(false);
  });

  it("does NOT run on the Edge runtime", () => {
    expect(schedulerDecision({ runtime: "edge", isVercel: false, secret: "s" }).run).toBe(false);
  });

  it("does NOT run without a CRON_SECRET (routes are fail-closed)", () => {
    expect(schedulerDecision({ runtime: "nodejs", isVercel: false, secret: undefined }).run).toBe(false);
  });
});

describe("buildCronUrl", () => {
  it("appends the key as the first query param", () => {
    expect(buildCronUrl("http://127.0.0.1:3000", "/api/cron/cleanup", "abc")).toBe(
      "http://127.0.0.1:3000/api/cron/cleanup?key=abc",
    );
  });
  it("uses & when the path already has a query", () => {
    expect(buildCronUrl("http://x:3000/", "/api/cron/cleanup?days=30", "a b")).toBe(
      "http://x:3000/api/cron/cleanup?days=30&key=a%20b",
    );
  });
});

describe("CRON_PLAN", () => {
  it("covers the three maintenance crons with sane intervals", () => {
    const paths = CRON_PLAN.map((p) => p[0]);
    expect(paths).toContain("/api/cron/offline-check");
    expect(paths).toContain("/api/cron/cleanup");
    expect(paths).toContain("/api/cron/reports");
    // every interval is positive and initial delays are staggered
    expect(CRON_PLAN.every(([, every, initial]) => every > 0 && initial > 0)).toBe(true);
  });
});
