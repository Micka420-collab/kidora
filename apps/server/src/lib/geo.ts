// Pure geospatial helpers for geofencing. No DB/Prisma imports so the
// distance math and enter/exit logic stay trivially unit-testable.

export type LatLng = { lat: number; lng: number };
export type Fence = {
  lat: number;
  lng: number;
  radius: number; // metres
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
};

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres (haversine). */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Is `p` within `radiusMeters` of `center`? */
export function isWithinRadius(p: LatLng, center: LatLng, radiusMeters: number): boolean {
  return haversineMeters(p.lat, p.lng, center.lat, center.lng) <= radiusMeters;
}

/** Outer hysteresis threshold: a device must move clearly beyond the radius (a
 *  band ≈ GPS jitter) before an exit counts, so a child lingering on the edge
 *  doesn't flap enter/exit every ping. */
export function outerRadius(radius: number): number {
  return radius + Math.max(radius * 0.15, 25);
}

/**
 * Notifiable geofence transition given the previous and current location.
 * Returns "enter" on entry (when notifyOnEnter), "exit" on departure (when
 * notifyOnExit), otherwise null. A null `prev` (first ping) never fires an exit.
 *
 * Hysteresis: entry requires the previous fix to be clearly OUTSIDE the outer
 * band and the current fix inside the radius; exit requires the previous fix
 * inside the radius and the current fix clearly beyond the outer band. Fixes
 * whose reported `accuracyM` is worse than the fence radius are ignored (too
 * uncertain to trust for enter/exit).
 */
export function geofenceTransition(
  prev: LatLng | null,
  now: LatLng,
  fence: Fence,
  nowAccuracyM?: number,
): "enter" | "exit" | null {
  if (typeof nowAccuracyM === "number" && Number.isFinite(nowAccuracyM) && nowAccuracyM > fence.radius) {
    return null; // fix too imprecise for this fence
  }
  const outer = outerRadius(fence.radius);
  const dNow = haversineMeters(now.lat, now.lng, fence.lat, fence.lng);
  const dPrev = prev ? haversineMeters(prev.lat, prev.lng, fence.lat, fence.lng) : null;
  if (!Number.isFinite(dNow)) return null;

  // enter: now inside the radius, and previously either unknown or clearly outside.
  if (dNow <= fence.radius && (dPrev === null || dPrev > outer) && fence.notifyOnEnter) return "enter";
  // exit: now clearly beyond the outer band, and previously inside the radius.
  if (dPrev !== null && dNow > outer && dPrev <= fence.radius && fence.notifyOnExit) return "exit";
  return null;
}
