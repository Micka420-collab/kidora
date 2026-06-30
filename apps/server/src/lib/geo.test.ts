import { describe, it, expect } from "vitest";
import { haversineMeters, isWithinRadius, geofenceTransition, type Fence } from "./geo";

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it("matches a known distance (Paris ↔ Lyon ≈ 392 km)", () => {
    const d = haversineMeters(48.8566, 2.3522, 45.7640, 4.8357);
    expect(d / 1000).toBeGreaterThan(390);
    expect(d / 1000).toBeLessThan(394);
  });

  it("computes ~111 m per 0.001° of latitude", () => {
    const d = haversineMeters(0, 0, 0.001, 0);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("does not return NaN for near-antipodal points", () => {
    const d = haversineMeters(0, 0, 0.0000001, 179.9999999);
    expect(Number.isNaN(d)).toBe(false);
  });
});

describe("isWithinRadius", () => {
  const center = { lat: 48.8566, lng: 2.3522 };
  it("is true at the center and just inside, false outside", () => {
    expect(isWithinRadius(center, center, 100)).toBe(true);
    // ~111 m north → inside a 150 m radius, outside a 50 m radius
    const north = { lat: 48.8566 + 0.001, lng: 2.3522 };
    expect(isWithinRadius(north, center, 150)).toBe(true);
    expect(isWithinRadius(north, center, 50)).toBe(false);
  });
});

describe("geofenceTransition", () => {
  const fence: Fence = { lat: 48.8566, lng: 2.3522, radius: 100, notifyOnEnter: true, notifyOnExit: true };
  const inside = { lat: 48.8566, lng: 2.3522 };
  const outside = { lat: 48.8700, lng: 2.3522 }; // ~1.5 km north

  it("fires 'enter' on outside → inside", () => {
    expect(geofenceTransition(outside, inside, fence)).toBe("enter");
  });

  it("fires 'exit' on inside → outside", () => {
    expect(geofenceTransition(inside, outside, fence)).toBe("exit");
  });

  it("returns null when staying inside or staying outside", () => {
    expect(geofenceTransition(inside, inside, fence)).toBeNull();
    expect(geofenceTransition(outside, outside, fence)).toBeNull();
  });

  it("never fires 'exit' on the first ping (prev = null)", () => {
    expect(geofenceTransition(null, outside, fence)).toBeNull();
    expect(geofenceTransition(null, inside, fence)).toBe("enter");
  });

  it("respects notifyOnEnter / notifyOnExit flags", () => {
    const enterOnly: Fence = { ...fence, notifyOnExit: false };
    expect(geofenceTransition(inside, outside, enterOnly)).toBeNull();
    const exitOnly: Fence = { ...fence, notifyOnEnter: false };
    expect(geofenceTransition(outside, inside, exitOnly)).toBeNull();
  });
});
