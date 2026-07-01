// Pure time-window helpers shared by the policy engine (bedtimes, routines).
// No DB/Prisma imports here so it stays trivially unit-testable.

export const WEEKDAYS_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type TimeWindow = { days: string[]; start: string; end: string };

/** Weekday key (sun..sat) for a date (server-local clock). */
export function todayWeekday(d = new Date()): string {
  return WEEKDAYS_ORDER[d.getDay()];
}

/** Weekday key (sun..sat) in the FAMILY's local timezone (offset = minutes to
 *  add to UTC). Use this for anything the server evaluates on the child's behalf
 *  (routines, "today's limit") so it doesn't run on the server's UTC clock. */
export function localWeekday(tzOffsetMinutes = 0, nowMs = Date.now()): string {
  return WEEKDAYS_ORDER[new Date(nowMs + tzOffsetMinutes * 60_000).getUTCDay()];
}

// Core window test, given the minute-of-day and weekday keys already resolved in
// the intended timezone. Handles overnight windows (start > end); empty `days`
// means "every day".
function windowActive(w: TimeWindow, mins: number, wd: string, prevWd: string): boolean {
  const [sh, sm] = w.start.split(":").map(Number);
  const [eh, em] = w.end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) {
    // same-day window — the day filter applies to the start day
    if (w.days.length && !w.days.includes(wd)) return false;
    return mins >= s && mins < e;
  }
  // overnight window: active in the evening part (>= s) on a listed day, or in
  // the morning part (< e) which belongs to the previous calendar day.
  if (mins >= s) return w.days.length === 0 || w.days.includes(wd);
  if (mins < e) return w.days.length === 0 || w.days.includes(prevWd);
  return false;
}

/**
 * Is `now` inside the [start,end) window on an allowed day, on the SERVER's
 * local clock? Handles overnight windows. Empty `days` means "every day".
 */
export function isWithinWindow(w: TimeWindow, now = new Date()): boolean {
  const day = now.getDay();
  return windowActive(w, now.getHours() * 60 + now.getMinutes(), WEEKDAYS_ORDER[day], WEEKDAYS_ORDER[(day + 6) % 7]);
}

/** As isWithinWindow, but evaluated in the FAMILY's local timezone. */
export function isWithinWindowTz(w: TimeWindow, tzOffsetMinutes = 0, nowMs = Date.now()): boolean {
  const d = new Date(nowMs + tzOffsetMinutes * 60_000);
  const day = d.getUTCDay();
  return windowActive(w, d.getUTCHours() * 60 + d.getUTCMinutes(), WEEKDAYS_ORDER[day], WEEKDAYS_ORDER[(day + 6) % 7]);
}

/** True if `now` (server-local clock) falls within any of the given windows. */
export function isBedtimeNow(windows: TimeWindow[] | undefined, now = new Date()): boolean {
  for (const w of windows ?? []) {
    if (isWithinWindow(w, now)) return true;
  }
  return false;
}

/** True if any window is active in the FAMILY's local timezone. */
export function isBedtimeNowTz(windows: TimeWindow[] | undefined, tzOffsetMinutes = 0, nowMs = Date.now()): boolean {
  for (const w of windows ?? []) {
    if (isWithinWindowTz(w, tzOffsetMinutes, nowMs)) return true;
  }
  return false;
}
