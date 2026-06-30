import { describe, it, expect } from "vitest";
import { retentionDays, cutoffDate, ymd, DEFAULT_RETENTION_DAYS } from "./retention";

describe("retentionDays", () => {
  it("defaults when unset or invalid", () => {
    expect(retentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays(null)).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays("abc")).toBe(DEFAULT_RETENTION_DAYS);
    expect(retentionDays("")).toBe(DEFAULT_RETENTION_DAYS);
  });
  it("accepts valid values and truncates", () => {
    expect(retentionDays("30")).toBe(30);
    expect(retentionDays(45.9)).toBe(45);
  });
  it("clamps to [7, 3650]", () => {
    expect(retentionDays(1)).toBe(7);
    expect(retentionDays(-5)).toBe(7);
    expect(retentionDays(99999)).toBe(3650);
  });
});

describe("cutoffDate", () => {
  it("subtracts the given number of days", () => {
    const now = new Date("2026-06-30T12:00:00.000Z");
    expect(cutoffDate(90, now).toISOString()).toBe("2026-04-01T12:00:00.000Z");
    expect(cutoffDate(0, now).toISOString()).toBe(now.toISOString());
  });
});

describe("ymd", () => {
  it("formats YYYY-MM-DD", () => {
    expect(ymd(new Date("2026-04-01T23:30:00.000Z"))).toBe("2026-04-01");
  });
});
