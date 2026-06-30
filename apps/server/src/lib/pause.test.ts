import { describe, it, expect } from "vitest";
import { isPausedNow, clampPauseMinutes } from "./pause";

const now = new Date("2026-06-30T12:00:00.000Z");

describe("isPausedNow", () => {
  it("is true for an indefinite manual pause", () => {
    expect(isPausedNow(true, null, now)).toBe(true);
    expect(isPausedNow(true, new Date("2020-01-01"), now)).toBe(true); // manual wins
  });
  it("is false when neither manual nor a future timed pause", () => {
    expect(isPausedNow(false, null, now)).toBe(false);
    expect(isPausedNow(false, undefined, now)).toBe(false);
  });
  it("respects a future timed pause", () => {
    expect(isPausedNow(false, new Date("2026-06-30T12:30:00.000Z"), now)).toBe(true);
  });
  it("ignores an expired timed pause", () => {
    expect(isPausedNow(false, new Date("2026-06-30T11:59:59.000Z"), now)).toBe(false);
  });
  it("accepts an ISO string", () => {
    expect(isPausedNow(false, "2026-06-30T13:00:00.000Z", now)).toBe(true);
  });
});

describe("clampPauseMinutes", () => {
  it("rejects non-positive / invalid", () => {
    expect(clampPauseMinutes(0)).toBeNull();
    expect(clampPauseMinutes(-5)).toBeNull();
    expect(clampPauseMinutes("abc")).toBeNull();
    expect(clampPauseMinutes(undefined)).toBeNull();
  });
  it("accepts and truncates", () => {
    expect(clampPauseMinutes(30)).toBe(30);
    expect(clampPauseMinutes(60.9)).toBe(60);
  });
  it("caps at 24h", () => {
    expect(clampPauseMinutes(99999)).toBe(24 * 60);
  });
});
