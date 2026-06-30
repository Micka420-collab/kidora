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

/**
 * Label ("HH:MM") of the earliest bedtime that *starts later today* and applies
 * to today, or null if none is upcoming (e.g. it's already bedtime, or there is
 * no window today). Lets the Kids screen gently announce "Dodo à 21:00".
 */
export function nextBedtimeStart(windows: TimeWindow[] | undefined, now: Date = new Date()): string | null {
  const wd = WEEKDAYS_ORDER[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  let best: number | null = null;
  for (const w of windows ?? []) {
    if (w.days.length && !w.days.includes(wd)) continue;
    const [sh, sm] = w.start.split(":").map(Number);
    const s = sh * 60 + sm;
    if (s > mins && (best === null || s < best)) best = s;
  }
  if (best === null) return null;
  const hh = String(Math.floor(best / 60)).padStart(2, "0");
  const mm = String(best % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
