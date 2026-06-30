/**
 * Bucket activity timestamps into 24 hour-of-day counts, in the family's
 * timezone. `tzOffsetMinutes` is the offset to ADD to UTC to reach local time
 * (e.g. +120 for UTC+2; pass `-new Date().getTimezoneOffset()` from a browser).
 * Defaults to 0 (UTC). Computed via getUTCHours after the shift so the result
 * is independent of the server's own timezone. Pure & unit-tested — used to
 * show "when is my child most active".
 */
export function hourHistogram(timestamps: (Date | string)[], tzOffsetMinutes = 0): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const t of timestamps) {
    const base = (typeof t === "string" ? new Date(t) : t).getTime();
    if (!Number.isFinite(base)) continue; // skip unparseable timestamps
    const h = new Date(base + tzOffsetMinutes * 60_000).getUTCHours();
    if (h >= 0 && h < 24) buckets[h]++;
  }
  return buckets;
}

/** The peak hour (0-23) of a 24-bucket histogram, or null if empty. */
export function peakHour(buckets: number[]): number | null {
  let max = 0;
  let peak: number | null = null;
  for (let h = 0; h < buckets.length; h++) {
    if (buckets[h] > max) {
      max = buckets[h];
      peak = h;
    }
  }
  return peak;
}
