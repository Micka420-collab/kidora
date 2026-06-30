// A device's stored `online` flag is set true on enroll/sync but is never reset
// to false, so on its own it would mark a powered-off device "online" forever.
// Liveness must therefore be derived from how recently the device reported.

export const ONLINE_WINDOW_MS = 2 * 60_000; // 2 minutes (matches the live card)

export type DeviceLiveness = { online: boolean; lastSeen: Date | string | null };

/**
 * True only if the device both claims to be online AND has reported within the
 * window. Stateless — call it wherever device online status is shown/counted so
 * a stale `online` flag can't make an offline device look connected.
 */
export function isDeviceOnline(
  d: DeviceLiveness,
  now: number = Date.now(),
  windowMs: number = ONLINE_WINDOW_MS,
): boolean {
  if (!d.online || !d.lastSeen) return false;
  return now - new Date(d.lastSeen).getTime() < windowMs;
}
