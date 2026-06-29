// Accumulates foreground app usage and produces telemetry deltas.
import { categorize, SYSTEM_PROCS } from "./categorize.js";

function localDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export class Tracker {
  constructor() {
    this.today = localDate();
    this.pending = new Map(); // appId -> seconds since last drain
    this.todayByApp = new Map(); // appId -> seconds today (for limits)
    this.events = [];
    this.lastFgId = null;
    this.knownApps = new Set();
  }

  _rollDate() {
    const now = localDate();
    if (now !== this.today) {
      this.today = now;
      this.todayByApp.clear();
    }
  }

  /** Account `intervalSec` seconds to the current foreground app. */
  tick(sample, intervalSec) {
    this._rollDate();
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

  /** Return telemetry payload and reset deltas. */
  drain() {
    const usage = [...this.pending.entries()].map(([appId, seconds]) => ({
      appId,
      appName: appId.replace(/\.exe$/i, "").replace(/^\w/, (c) => c.toUpperCase()),
      category: categorize(appId),
      date: this.today,
      seconds,
    }));
    const events = this.events.map((e) => ({ ...e, ts: new Date().toISOString() }));
    this.pending.clear();
    this.events = [];
    return { usage, events };
  }
}
