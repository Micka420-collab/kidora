import { describe, it, expect, afterEach } from "vitest";
import { enrollTokenTtlMs, newEnrollTokenExpiry, isEnrollTokenExpired } from "./enroll-token";

const NOW = 1_800_000_000_000;

afterEach(() => {
  delete process.env.ENROLL_TOKEN_TTL_HOURS;
});

describe("enrollTokenTtlMs", () => {
  it("defaults to 72h when unset or garbage", () => {
    expect(enrollTokenTtlMs(undefined)).toBe(72 * 3_600_000);
    expect(enrollTokenTtlMs("abc")).toBe(72 * 3_600_000);
    expect(enrollTokenTtlMs("-5")).toBe(72 * 3_600_000);
  });
  it("honours an explicit TTL, including 0 = disabled", () => {
    expect(enrollTokenTtlMs("24")).toBe(24 * 3_600_000);
    expect(enrollTokenTtlMs("0")).toBe(0);
  });
});

describe("newEnrollTokenExpiry", () => {
  it("stamps now + TTL", () => {
    process.env.ENROLL_TOKEN_TTL_HOURS = "24";
    expect(newEnrollTokenExpiry(NOW)?.getTime()).toBe(NOW + 24 * 3_600_000);
  });
  it("returns null when the TTL is disabled", () => {
    process.env.ENROLL_TOKEN_TTL_HOURS = "0";
    expect(newEnrollTokenExpiry(NOW)).toBeNull();
  });
});

describe("isEnrollTokenExpired", () => {
  it("expires a never-enrolled device past its deadline", () => {
    expect(isEnrollTokenExpired({ enrolled: false, enrollTokenExpiresAt: new Date(NOW - 1) }, NOW)).toBe(true);
    expect(isEnrollTokenExpired({ enrolled: false, enrollTokenExpiresAt: new Date(NOW + 1) }, NOW)).toBe(false);
  });
  it("never expires an enrolled device (token = live credential)", () => {
    expect(isEnrollTokenExpired({ enrolled: true, enrollTokenExpiresAt: new Date(NOW - 1) }, NOW)).toBe(false);
  });
  it("never expires legacy rows without a deadline", () => {
    expect(isEnrollTokenExpired({ enrolled: false, enrollTokenExpiresAt: null }, NOW)).toBe(false);
  });
});
