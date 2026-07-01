// Timezone-aware "local day" helpers. A family's screen-time day, bonus grants,
// and "today's usage" must be bucketed in the FAMILY's local timezone, not the
// server's (UTC on Vercel). The timezone is expressed as an offset in minutes to
// ADD to UTC to reach local time (e.g. +120 for UTC+2 / -300 for UTC-5) — the
// same sign convention as `-new Date().getTimezoneOffset()`. Pure & unit-tested.

/** Current calendar date "YYYY-MM-DD" in the given tz offset. */
export function localDateString(nowMs: number, tzOffsetMinutes = 0): string {
  return new Date(nowMs + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** `daysAgo` days before now, as a "YYYY-MM-DD" in the given tz offset. */
export function localDateStringDaysAgo(nowMs: number, daysAgo: number, tzOffsetMinutes = 0): string {
  return localDateString(nowMs - daysAgo * 86_400_000, tzOffsetMinutes);
}

/** Clamp a timezone offset (minutes) to ±14h; non-finite → 0 (UTC). */
export function clampTzOffset(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(840, Math.max(-840, Math.trunc(n)));
}
