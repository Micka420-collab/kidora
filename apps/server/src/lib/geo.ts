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

/**
 * Notifiable geofence transition given the previous and current location.
 * Returns "enter" on entry (when notifyOnEnter), "exit" on departure (when
 * notifyOnExit), otherwise null. A null `prev` (first ping) never fires an exit.
 */
export function geofenceTransition(
  prev: LatLng | null,
  now: LatLng,
  fence: Fence,
): "enter" | "exit" | null {
  const nowIn = isWithinRadius(now, fence, fence.radius);
  const wasIn = prev ? isWithinRadius(prev, fence, fence.radius) : false;
  if (nowIn && !wasIn && fence.notifyOnEnter) return "enter";
  if (!nowIn && wasIn && fence.notifyOnExit) return "exit";
  return null;
}
