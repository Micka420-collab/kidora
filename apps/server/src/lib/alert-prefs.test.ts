import { describe, it, expect } from "vitest";
import { parseMutedTypes, sanitizeMutedTypes, isAlertMuted } from "./alert-prefs";

describe("parseMutedTypes", () => {
  it("returns [] for empty/invalid input", () => {
    expect(parseMutedTypes(undefined)).toEqual([]);
    expect(parseMutedTypes(null)).toEqual([]);
    expect(parseMutedTypes("")).toEqual([]);
    expect(parseMutedTypes("not-json")).toEqual([]);
    expect(parseMutedTypes('{"a":1}')).toEqual([]);
  });
  it("keeps only valid mutable types", () => {
    expect(parseMutedTypes('["new_app","keyword","panic","bogus"]')).toEqual(["new_app", "keyword"]);
  });
});

describe("sanitizeMutedTypes", () => {
  it("drops non-arrays, unknowns, safety types, and de-dupes", () => {
    expect(sanitizeMutedTypes("x")).toEqual([]);
    expect(sanitizeMutedTypes(["geofence", "geofence", "risk", "panic", 42])).toEqual(["geofence"]);
  });
});

describe("isAlertMuted", () => {
  it("never mutes safety/unknown types", () => {
    expect(isAlertMuted(["panic", "risk"], "panic")).toBe(false);
    expect(isAlertMuted(["risk"], "risk")).toBe(false);
    expect(isAlertMuted(["whatever"], "unknown_type")).toBe(false);
  });
  it("mutes a mutable type only when listed", () => {
    expect(isAlertMuted(["new_app"], "new_app")).toBe(true);
    expect(isAlertMuted([], "new_app")).toBe(false);
    expect(isAlertMuted(["geofence"], "keyword")).toBe(false);
  });
});
