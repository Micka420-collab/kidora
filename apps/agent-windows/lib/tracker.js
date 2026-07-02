// Accumulates foreground app usage and produces telemetry deltas.
import { categorize, SYSTEM_PROCS } from "./categorize.js";

// LOCAL calendar date "YYYY-MM-DD" (not UTC) — so the daily-usage day rolls over
// at the family's local midnight, matching the server (which buckets by the
// tzOffset the agent reports) and the enforcer's local weekday/hour checks.
function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export class Tracker {
  /**
   * @param {object} [snapshot] persisted state from disk (see `snapshot()`).
   * @param {() => Date} [nowFn] source of "now" — pass the TRUSTED clock so the
   *   day-rollover decision on restore can't be fooled by a rewound system clock
   *   (a child setting the date back a day to reset the daily counter). Defaults
   *   to the wall clock.
   */
  constructor(snapshot, nowFn) {
    this._now = typeof nowFn === "function" ? nowFn : () => new Date();
    this.today = localDate(this._now());
    this.pending = new Map(); // appId -> seconds since last drain
    this.todayByApp = new Map(); // appId -> seconds today (for limits)
    this.events = [];
    this.lastFgId = null;
    this.knownApps = new Set();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  /**
   * Rehydrate from a persisted snapshot at startup. If the snapshot is from an
   * EARLIER local day, the daily usage counter (which drives screen-time limits)
   * is intentionally dropped so today starts fresh; if it's from TODAY, the
   * counter is preserved — a reboot mid-day must NOT hand the child extra time.
   * The un-synced spool (pending/events) is always kept so telemetry survives a
   * crash.
   */
  restoreSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;
    const sameDay = snap.today === this.today;
    if (sameDay && snap.todayByApp) {
      for (const [k, v] of Object.entries(snap.todayByApp)) {
        if (Number.isFinite(v) && v > 0) this.todayByApp.set(k, v);
      }
    }
    if (snap.pending) {
      for (const [k, v] of Object.entries(snap.pending)) {
        if (Number.isFinite(v) && v > 0) this.pending.set(k, v);
      }
    }
    if (Array.isArray(snap.events)) this.events = snap.events.slice(0, 500);
    if (Array.isArray(snap.knownApps)) this.knownApps = new Set(snap.knownApps);
  }

  /** Serializable view of state to persist to disk (survives reboot/crash). */
  snapshot() {
    return {
      today: this.today,
      todayByApp: Object.fromEntries(this.todayByApp),
      pending: Object.fromEntries(this.pending),
      events: this.events,
      knownApps: [...this.knownApps],
    };
  }

  _rollDate(now = this._now()) {
    const day = localDate(now);
    if (day !== this.today) {
      this.today = day;
      this.todayByApp.clear();
    }
  }

  /** Account `intervalSec` seconds to the current foreground app. `now` is the
   *  TRUSTED time so the daily counter rolls over at the real local midnight, not
   *  a midnight the child faked by moving the system clock. */
  tick(sample, intervalSec, now = new Date()) {
    this._rollDate(now);
    const name = sample?.fg?.name;
    if (!name) return;
    const key = name.toLowerCase();
    if (SYSTEM_PROCS.has(key)) {
      this.lastFgId = sample.fg.procId;
      return;
    }
    const appId = `${key}.exe`;

    // detect app switch -> app_open event
    if (sample.fg.procId !== this.lastFgId) {
      this.lastFgId = sample.fg.procId;
      this.events.push({
        type: "app_open",
        title: name,
        detail: sample.fg.title || undefined,
        category: categorize(name),
      });
      // detect brand-new app
      if (!this.knownApps.has(appId)) {
        this.knownApps.add(appId);
        this.events.push({ type: "new_app", title: name, detail: appId });
      }
    }

    this.pending.set(appId, (this.pending.get(appId) ?? 0) + intervalSec);
    this.todayByApp.set(appId, (this.todayByApp.get(appId) ?? 0) + intervalSec);
  }

  /** Seconds used today by an app (matches by exe id or bare name). */
  todaySeconds(appId) {
    const id = appId.toLowerCase().endsWith(".exe") ? appId.toLowerCase() : `${appId.toLowerCase()}.exe`;
    return this.todayByApp.get(id) ?? 0;
  }

  totalTodaySeconds() {
    let s = 0;
    for (const v of this.todayByApp.values()) s += v;
    return s;
  }

  pushEvent(ev) {
    this.events.push(ev);
  }

  /**
   * CUMULATIVE seconds-per-app for today (not deltas). Sent alongside the delta
   * usage so an idempotency-aware server can SET (not increment) the daily total
   * — a retried sync after a lost response then can't double-count screen time
   * (which would hand the child extra time). Self-healing: always the current
   * truth, so nothing is lost on a failed sync either.
   */
  cumulativeUsage() {
    return [...this.todayByApp.entries()].map(([appId, seconds]) => ({
      appId,
      appName: appId.replace(/\.exe$/i, "").replace(/^\w/, (c) => c.toUpperCase()),
      category: categorize(appId),
      date: this.today,
      seconds,
    }));
  }

  /** Return telemetry payload and reset deltas. */
  drain() {
    const usage = [...this.pending.entries()].map(([appId, seconds]) => ({
      appId,
      appName: appId.replace(/\.exe$/i, "").replace(/^\w/, (c) => c.toUpperCase()),
      category: categorize(appId),
      date: this.today,
      seconds,
    }));
    // Keep an event's original timestamp if it already has one (i.e. it was
    // drained before and is being re-drained after a failed sync).
    const events = this.events.map((e) => ({ ...e, ts: e.ts || new Date().toISOString() }));
    this.pending.clear();
    this.events = [];
    return { usage, events };
  }

  /**
   * Merge a previously-drained batch back in after a FAILED sync, so it is
   * resent next time instead of being silently dropped. Losing `usage` would
   * under-count screen time and hand the child extra time — the wrong way to
   * fail for a control app. Safe because the failed request never committed
   * server-side.
   */
  restore({ usage, events } = {}) {
    for (const u of usage || []) {
      if (!u?.appId) continue;
      this.pending.set(u.appId, (this.pending.get(u.appId) ?? 0) + (u.seconds || 0));
    }
    if (events?.length) this.events = [...events, ...this.events];
  }
}
