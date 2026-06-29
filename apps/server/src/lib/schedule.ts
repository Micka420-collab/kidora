// Pure time-window helpers shared by the policy engine (bedtimes, routines).
// No DB/Prisma imports here so it stays trivially unit-testable.

export const WEEKDAYS_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type TimeWindow = { days: string[]; start: string; end: string };

/** Weekday key (sun..sat) for a date. */
export function todayWeekday(d = new Date()): string {
  return WEEKDAYS_ORDER[d.getDay()];
}

/**
 * Is `now` inside the [start,end) window on an allowed day?
 * Handles overnight windows (start > end, e.g. 21:00 → 07:00).
 * Empty `days` means "every day".
 */
export function isWithinWindow(w: TimeWindow, now = new Date()): boolean {
  const wd = todayWeekday(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = w.start.split(":").map(Number);
  const [eh, em] = w.end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  if (s <= e) {
    // same-day window — the day filter applies to the start day
    if (w.days.length && !w.days.includes(wd)) return false;
    return mins >= s && mins < e;
  }
  // overnight window: active in the evening part (>= s) on a listed day,
  // or in the morning part (< e) which belongs to the next calendar day.
  const prevWd = WEEKDAYS_ORDER[(now.getDay() + 6) % 7];
  if (mins >= s) return w.days.length === 0 || w.days.includes(wd);
  if (mins < e) return w.days.length === 0 || w.days.includes(prevWd);
  return false;
}

/** True if `now` falls within any of the given windows. */
export function isBedtimeNow(windows: TimeWindow[] | undefined, now = new Date()): boolean {
  for (const w of windows ?? []) {
    if (isWithinWindow(w, now)) return true;
  }
  return false;
}
