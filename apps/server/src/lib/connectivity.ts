export const DEFAULT_OFFLINE_HOURS = 12;
const MIN_HOURS = 1;
const MAX_HOURS = 168; // 7 days

/** Parse & clamp the offline-alert threshold (hours). Pure. */
export function offlineThresholdHours(raw: string | number | undefined | null): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_OFFLINE_HOURS;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.trunc(n)));
}

/**
 * Has a device gone silent? True when it was active before (lastSeen set) but
 * its last report is older than the threshold. Pure & unit-tested.
 */
export function isDeviceStale(
  lastSeen: Date | string | null | undefined,
  thresholdHours: number,
  now: Date = new Date(),
): boolean {
  if (!lastSeen) return false; // never enrolled/reported → not an "outage"
  const seen = typeof lastSeen === "string" ? new Date(lastSeen) : lastSeen;
  return now.getTime() - seen.getTime() > thresholdHours * 3600_000;
}
