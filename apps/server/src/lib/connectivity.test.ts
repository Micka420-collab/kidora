import { describe, it, expect } from "vitest";
import { offlineThresholdHours, isDeviceStale, DEFAULT_OFFLINE_HOURS } from "./connectivity";

describe("offlineThresholdHours", () => {
  it("defaults on invalid input", () => {
    expect(offlineThresholdHours(undefined)).toBe(DEFAULT_OFFLINE_HOURS);
    expect(offlineThresholdHours("abc")).toBe(DEFAULT_OFFLINE_HOURS);
  });
  it("clamps to [1, 168]", () => {
    expect(offlineThresholdHours(0)).toBe(1);
    expect(offlineThresholdHours(9999)).toBe(168);
    expect(offlineThresholdHours("6")).toBe(6);
  });
});

describe("isDeviceStale", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");
  it("is false for a never-seen device", () => {
    expect(isDeviceStale(null, 12, now)).toBe(false);
    expect(isDeviceStale(undefined, 12, now)).toBe(false);
  });
  it("is false when seen recently", () => {
    expect(isDeviceStale(new Date("2026-06-30T11:00:00.000Z"), 12, now)).toBe(false);
  });
  it("is true past the threshold", () => {
    expect(isDeviceStale(new Date("2026-06-29T23:00:00.000Z"), 12, now)).toBe(true);
  });
  it("accepts an ISO string", () => {
    expect(isDeviceStale("2026-06-29T00:00:00.000Z", 12, now)).toBe(true);
  });
});
