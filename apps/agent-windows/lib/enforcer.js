// Applies a Kidora policy to the live machine state each sensor tick.
import { randomUUID } from "node:crypto";
import { killProcess, showOverlay, hideOverlay, notify } from "./win.js";
import { SYSTEM_PROCS } from "./categorize.js";
import { log } from "./logger.js";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Today's effective screen-time limit in minutes (0 = free day / no limit set).
 * A free day (no base limit for this weekday) STAYS free even when bonus minutes
 * were granted — matching the server's computeScreenTimeToday and the mobile
 * client. Previously the bonus was added unconditionally, so on an unlimited day
 * a reward grant turned into a hard cap after only `bonus` minutes.
 */
function effectiveLimitMinutes(dailyLimits, weekdayKey, bonusMinutesToday = 0) {
  const base = dailyLimits?.[weekdayKey] ?? 0;
  return base > 0 ? base + (bonusMinutesToday ?? 0) : 0;
}

function isBedtimeNow(bedtimes, now = new Date()) {
  const todayWd = WEEKDAYS[now.getDay()];
  const prevWd = WEEKDAYS[(now.getDay() + 6) % 7]; // yesterday's weekday
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of bedtimes || []) {
    const [sh, sm] = b.start.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    const days = b.days;
    const onDay = (wd) => !days?.length || days.includes(wd);

    if (s <= e) {
      // Same-day window (e.g. 13:00–15:00) → check today's weekday.
      if (mins >= s && mins < e && onDay(todayWd)) return true;
    } else {
      // Overnight window (e.g. 21:00–07:00) spans two calendar days. The evening
      // part (mins >= s) belongs to today; the morning tail (mins < e) belongs to
      // the day the window STARTED — i.e. yesterday's weekday, not today's.
      if (mins >= s && onDay(todayWd)) return true;
      if (mins < e && onDay(prevWd)) return true;
    }
  }
  return false;
}

export class Enforcer {
  constructor({ dryRun = false } = {}) {
    this.dryRun = dryRun;
    this.lastKill = new Map(); // appId -> ts (throttle kills)
    this.blocked = false; // is the block overlay currently shown?
    this.blockReason = null;
    this.limitNotifiedDate = null;
    this.events = [];
  }

  drainEvents() {
    // Stamp a stable id (kept across a failed-sync re-queue) so the server can
    // dedup a retried batch exactly-once.
    const e = this.events.map((x) => ({ ...x, id: x.id || randomUUID() }));
    this.events = [];
    return e;
  }

  /** Re-queue events after a failed sync so they aren't dropped. */
  restoreEvents(events) {
    if (events?.length) this.events = [...events, ...this.events];
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

  /** Show/refresh the block overlay (soft block — keeps the session). */
  _block({ reason, title, message }) {
    if (this.blocked && this.blockReason === reason) return; // already blocking, same reason
    const first = !this.blocked;
    this.blocked = true;
    this.blockReason = reason;
    log.warn(`Blocage écran: ${reason}`);
    if (!this.dryRun) {
      if (first) notify("Kidora", message);
      showOverlay(title, message);
    }
  }

  /** Remove the block overlay when no condition applies anymore. */
  _unblock() {
    if (!this.blocked) return;
    this.blocked = false;
    this.blockReason = null;
    log.info("Déblocage écran.");
    if (!this.dryRun) hideOverlay();
  }

  /** Main enforcement decision for one sample. `now` is the TRUSTED time (server
   *  anchored + monotonic) so a tampered system clock can't move bedtime, the
   *  weekday, or the daily-limit day. Defaults to the wall clock. */
  async apply(policy, sample, tracker, now = new Date()) {
    if (!policy) return;
    const runningSet = new Set((sample.procs || []).map((p) => p.toLowerCase()));

    // ── 1. Global block conditions → fullscreen overlay (not a full lock) ──
    let block = null;
    if (policy.paused) {
      block = { reason: "pause", title: "En pause ⏸", message: "Ton accès est en pause. Reviens un peu plus tard 🙂" };
    } else if (isBedtimeNow(policy.screenTime?.bedtimes, now)) {
      block = { reason: "bedtime", title: "Heure du coucher 🌙", message: "C'est l'heure de dormir. À demain !" };
    } else if (policy.screenTime?.enabled) {
      const wd = WEEKDAYS[now.getDay()];
      const limitMin = effectiveLimitMinutes(policy.screenTime.dailyLimits, wd, policy.screenTime.bonusMinutesToday);
      const total = tracker.totalTodaySeconds();
      if (limitMin > 0 && total >= limitMin * 60) {
        // Local date, so the "limit reached" notice re-arms at local midnight
        // (matching the tracker's local-day usage reset).
        const n = now;
        const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
        if (this.limitNotifiedDate !== today) {
          this.limitNotifiedDate = today;
          this.events.push({ type: "limit_reached", title: `Limite quotidienne (${limitMin} min)` });
        }
        block = { reason: "limit", title: "Temps d'écran terminé ⏰", message: `Tu as atteint ta limite de ${limitMin} min pour aujourd'hui.` };
      }
    }

    if (block) this._block(block);
    else this._unblock();

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

export { isBedtimeNow, effectiveLimitMinutes };
