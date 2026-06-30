/**
 * Bucket activity timestamps into 24 hour-of-day counts (local time).
 * Pure & unit-tested — used to show "when is my child most active".
 */
export function hourHistogram(timestamps: (Date | string)[]): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const t of timestamps) {
    const d = typeof t === "string" ? new Date(t) : t;
    const h = d.getHours();
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
