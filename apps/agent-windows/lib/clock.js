// Trusted clock — defeats system-clock tampering, a classic way kids bypass
// parental controls (advance the clock past bedtime, or roll it to "tomorrow" to
// reset the daily screen-time counter, or rewind it to dodge a limit).
//
// Two independent guarantees:
//   1. ENFORCEMENT USES A CLOCK THE CHILD CAN'T MOVE. Once we've seen the server's
//      time, `trustedNow()` is derived from that authoritative instant PLUS the
//      elapsed *monotonic* time (process.hrtime — unaffected by wall-clock edits).
//      Changing the Windows clock does not shift it. A persisted monotonic floor
//      also means trusted time can never move BACKWARD across restarts, so a
//      rewind can't re-open a passed bedtime.
//   2. THE PARENT IS TOLD. Each sync compares the server's time to the local
//      wall clock; a large skew raises a `clock_change` anti-tamper alert. Using
//      the server as the reference avoids the false positives a pure
//      monotonic-vs-wall check would get on laptop sleep/resume.

const CLOCK_SKEW_ALERT_MS = 5 * 60 * 1000; // >5 min local-vs-server skew = tamper signal

/** Monotonic milliseconds (arbitrary origin; only deltas are meaningful). Not
 *  affected by wall-clock changes — the whole point. */
function monoMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export class TrustedClock {
  /** @param {object} [snapshot] persisted `{ maxTrustedMs, offsetMs }`. */
  constructor(snapshot) {
    this._anchorServerMs = null; // authoritative wall time at last sync
    this._anchorMono = null; // monotonic reading captured with the anchor
    this._maxTrusted = Number.isFinite(snapshot?.maxTrustedMs) ? snapshot.maxTrustedMs : 0;
    this._offset = Number.isFinite(snapshot?.offsetMs) ? snapshot.offsetMs : 0; // Date.now()+offset ≈ trusted
  }

  /**
   * Anchor to the server's authoritative time (call on every successful sync).
   * Returns { skewMs, tampered } describing how far the LOCAL clock drifted from
   * the server — the caller turns `tampered` into an anti-tamper alert.
   */
  onServerTime(iso) {
    const t = typeof iso === "number" ? iso : Date.parse(iso);
    if (!Number.isFinite(t)) return { skewMs: 0, tampered: false };
    const skew = Date.now() - t; // +ve: local clock is ahead of the server
    this._anchorServerMs = t;
    this._anchorMono = monoMs();
    this._offset = t - Date.now(); // best-effort correction that survives a restart
    this._bump(t);
    return { skewMs: skew, tampered: Math.abs(skew) > CLOCK_SKEW_ALERT_MS };
  }

  /**
   * Best trusted "now" in epoch ms. Anchored → server time + monotonic elapsed
   * (immune to wall-clock edits this session). Otherwise the wall clock corrected
   * by the last known server offset. Never allowed to move backward (rewind
   * can't re-open a passed bedtime or un-expire a reached limit).
   */
  trustedNow() {
    let t;
    if (this._anchorServerMs != null) {
      t = this._anchorServerMs + (monoMs() - this._anchorMono);
    } else {
      t = Date.now() + this._offset;
    }
    if (t < this._maxTrusted) t = this._maxTrusted; // monotonic floor
    this._bump(t);
    return t;
  }

  /** Convenience: trusted now as a Date, for the enforcer/tracker. */
  now() {
    return new Date(this.trustedNow());
  }

  _bump(t) {
    if (Number.isFinite(t) && t > this._maxTrusted) this._maxTrusted = t;
  }

  /** Serializable state to persist (survives reboot; blocks cross-reboot rewind). */
  snapshot() {
    return { maxTrustedMs: this._maxTrusted, offsetMs: this._offset };
  }
}

export { monoMs, CLOCK_SKEW_ALERT_MS };
