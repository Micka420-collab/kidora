// Tiny mirror of the server's bedtime/time-window logic (pure, no deps) so the
// Kids screen can tell the child when it's bedtime. Handles overnight windows
// (start > end, e.g. 21:00 → 07:00) and an empty `days` = every day.

const WEEKDAYS_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type TimeWindow = { days: string[]; start: string; end: string };

function isWithinWindow(w: TimeWindow, now: Date): boolean {
  const wd = WEEKDAYS_ORDER[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = w.start.split(":").map(Number);
  const [eh, em] = w.end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  if (s <= e) {
    if (w.days.length && !w.days.includes(wd)) return false;
    return mins >= s && mins < e;
  }
  const prevWd = WEEKDAYS_ORDER[(now.getDay() + 6) % 7];
  if (mins >= s) return w.days.length === 0 || w.days.includes(wd);
  if (mins < e) return w.days.length === 0 || w.days.includes(prevWd);
  return false;
}

export function isBedtimeNow(windows: TimeWindow[] | undefined, now: Date = new Date()): boolean {
  for (const w of windows ?? []) {
    if (isWithinWindow(w, now)) return true;
  }
  return false;
}
