// Simple in-memory fixed-window rate limiter (per key).
// Good enough for a single-instance dev/demo server. For multi-instance
// production, back this with Redis/Upstash.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

// ── Progressive login lockout (brute-force protection) ──────────────────
// Tracks *failed* attempts per key (e.g. email+IP) and locks for a growing
// duration once a threshold is reached. Cleared on a successful login.

type Fail = { count: number; lastAt: number; lockedUntil: number };
const failures = new Map<string, Fail>();

const LOCK_THRESHOLD = 5; // failures before the first lock
const FAIL_WINDOW_MS = 30 * 60_000; // forget failures after 30 min of silence
const MAX_LOCK_MS = 15 * 60_000; // cap a single lock at 15 min

export type LockStatus = { locked: boolean; retryAfter: number };

/** Is this key currently locked? (no mutation) */
export function loginLockStatus(key: string, now = Date.now()): LockStatus {
  const f = failures.get(key);
  if (f && f.lockedUntil > now) return { locked: true, retryAfter: Math.ceil((f.lockedUntil - now) / 1000) };
  return { locked: false, retryAfter: 0 };
}

/** Record a failed login; returns the resulting lock status. */
export function recordLoginFailure(key: string, now = Date.now()): LockStatus {
  let f = failures.get(key);
  if (!f || now - f.lastAt > FAIL_WINDOW_MS) f = { count: 0, lastAt: now, lockedUntil: 0 };
  f.count++;
  f.lastAt = now;
  if (f.count >= LOCK_THRESHOLD) {
    const over = f.count - LOCK_THRESHOLD; // 0,1,2,…
    const lockMs = Math.min(MAX_LOCK_MS, 2 ** over * 30_000); // 30s,1m,2m,… cap 15m
    f.lockedUntil = now + lockMs;
  }
  failures.set(key, f);
  return loginLockStatus(key, now);
}

/** Clear failures for a key after a successful login. */
export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}
