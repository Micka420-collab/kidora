// Applies a Kidora policy to the live machine state each sensor tick.
import { killProcess, lockWorkstation, notify } from "./win.js";
import { SYSTEM_PROCS } from "./categorize.js";
import { log } from "./logger.js";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isBedtimeNow(bedtimes, now = new Date()) {
  const wd = WEEKDAYS[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of bedtimes || []) {
    if (b.days?.length && !b.days.includes(wd)) continue;
    const [sh, sm] = b.start.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s <= e ? mins >= s && mins < e : mins >= s || mins < e) return true;
  }
  return false;
}

export class Enforcer {
  constructor({ dryRun = false } = {}) {
    this.dryRun = dryRun;
    this.lastKill = new Map(); // appId -> ts (throttle kills)
    this.lastLock = 0;
    this.limitNotifiedDate = null;
    this.events = [];
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  async _kill(appId, name, reason) {
    const now = Date.now();
    if (now - (this.lastKill.get(appId) ?? 0) < 15000) return; // throttle 15s
    this.lastKill.set(appId, now);
    log.warn(`Blocage app: ${name} (${reason})`);
    this.events.push({ type: "blocked", title: name, detail: reason, blocked: true });
    if (!this.dryRun) {
      await killProcess(appId);
      notify("Kidora", `« ${name} » est bloqué par le contrôle parental.`);
    }
  }

  async _lock(reason, message) {
    const now = Date.now();
    if (now - this.lastLock < 60000) return; // at most once per minute
    this.lastLock = now;
    log.warn(`Verrouillage: ${reason}`);
    if (!this.dryRun) {
      notify("Kidora", message);
      await lockWorkstation();
    }
  }

  /** Main enforcement decision for one sample. */
  async apply(policy, sample, tracker) {
    if (!policy) return;
    const runningSet = new Set((sample.procs || []).map((p) => p.toLowerCase()));

    // ── 1. Global lock conditions ──
    if (policy.paused) {
      await this._lock("pause", "Internet mis en pause par un parent.");
    } else if (isBedtimeNow(policy.screenTime?.bedtimes)) {
      await this._lock("bedtime", "C'est l'heure de dormir 🌙 — appareil verrouillé.");
    } else if (policy.screenTime?.enabled) {
      const wd = WEEKDAYS[new Date().getDay()];
      const limitMin = policy.screenTime.dailyLimits?.[wd] ?? 0;
      const total = tracker.totalTodaySeconds();
      if (limitMin > 0 && total >= limitMin * 60) {
        const today = new Date().toISOString().slice(0, 10);
        if (this.limitNotifiedDate !== today) {
          this.limitNotifiedDate = today;
          this.events.push({ type: "limit_reached", title: `Limite quotidienne (${limitMin} min)` });
        }
        await this._lock("limit", "Limite de temps d'écran atteinte pour aujourd'hui.");
      }
    }

    // ── 2. Per-app rules ──
    for (const rule of policy.appRules || []) {
      const bare = rule.appId.replace(/\.exe$/i, "").toLowerCase();
      if (SYSTEM_PROCS.has(bare)) continue;
      if (!runningSet.has(bare)) continue;

      if (rule.action === "block") {
        await this._kill(rule.appId, rule.appName, "application bloquée");
      } else if (rule.action === "limit" && rule.dailyLimitMinutes) {
        const used = tracker.todaySeconds(rule.appId);
        if (used >= rule.dailyLimitMinutes * 60) {
          await this._kill(rule.appId, rule.appName, `limite ${rule.dailyLimitMinutes} min atteinte`);
        }
      }
    }
  }
}

export { isBedtimeNow };
