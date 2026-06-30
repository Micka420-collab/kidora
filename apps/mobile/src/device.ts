// A device's stored `online` flag is set true on sync but never reset to false,
// so on its own it marks a powered-off device "online" forever. Derive liveness
// from how recently it reported (mirrors the server's isDeviceOnline / 2 min).

const ONLINE_WINDOW_MS = 2 * 60_000;

export function isDeviceOnline(
  d: { online: boolean; lastSeen: string | null },
  now: number = Date.now(),
): boolean {
  if (!d.online || !d.lastSeen) return false;
  return now - new Date(d.lastSeen).getTime() < ONLINE_WINDOW_MS;
}
