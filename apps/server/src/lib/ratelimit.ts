// Rate limiting & progressive login lockout, with a pluggable store.
//
// Two interchangeable stores:
//  - memory: per-process Maps. Fast and dependency-free, but every serverless
//    instance (and every restart) starts blank, so limits are only advisory.
//    Dev and tests default here.
//  - db: shared state in the main database via atomic upserts. The SQL is
//    written to run on BOTH SQLite and Postgres (ON CONFLICT … DO UPDATE …
//    RETURNING), so self-host and Vercel/Neon get the same behaviour: counters
//    survive restarts and are shared across instances — which is what makes
//    the brute-force lockout real in production.
//
// Selection: RATE_LIMIT_STORE=db|memory forces a store; otherwise db is used
// when NODE_ENV=production. A DB error DEGRADES to the memory store (so a DB
// outage can't lock every parent out, while keeping per-instance protection)
// and is logged.

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };
export type LockStatus = { locked: boolean; retryAfter: number };

const LOCK_THRESHOLD = 5; // failures before the first lock
const FAIL_WINDOW_MS = 30 * 60_000; // forget failures after 30 min of silence
const MAX_LOCK_MS = 15 * 60_000; // cap a single lock at 15 min

/** Progressive lock duration for the Nth failure (N >= LOCK_THRESHOLD). */
function lockDurationMs(count: number): number {
  const over = count - LOCK_THRESHOLD; // 0,1,2,…
  return Math.min(MAX_LOCK_MS, 2 ** over * 30_000); // 30s,1m,2m,… cap 15m
}

// ── Memory store ─────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

type Fail = { count: number; lastAt: number; lockedUntil: number };
const failures = new Map<string, Fail>();

const memoryStore = {
  hit(key: string, limit: number, windowMs: number, now: number): RateResult {
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
  },
  lockStatus(key: string, now: number): LockStatus {
    const f = failures.get(key);
    if (f && f.lockedUntil > now) return { locked: true, retryAfter: Math.ceil((f.lockedUntil - now) / 1000) };
    return { locked: false, retryAfter: 0 };
  },
  recordFailure(key: string, now: number): LockStatus {
    let f = failures.get(key);
    if (!f || now - f.lastAt > FAIL_WINDOW_MS) f = { count: 0, lastAt: now, lockedUntil: 0 };
    f.count++;
    f.lastAt = now;
    if (f.count >= LOCK_THRESHOLD) f.lockedUntil = now + lockDurationMs(f.count);
    failures.set(key, f);
    return memoryStore.lockStatus(key, now);
  },
  clearFailures(key: string): void {
    failures.delete(key);
  },
};

// ── DB store (shared across instances; SQLite AND Postgres) ─────────────

// Lazy import so the memory-only path (dev, unit tests) never touches the DB
// client. The prisma module is a singleton, shared with the rest of the app.
async function db() {
  const { prisma } = await import("./prisma");
  return prisma;
}

const dbStore = {
  async hit(key: string, limit: number, windowMs: number, now: number): Promise<RateResult> {
    const prisma = await db();
    // Atomic: one statement both starts a fresh window when the old one has
    // expired and increments the current one — no read-modify-write race.
    // Unqualified column refs in DO UPDATE resolve to the EXISTING row on both
    // SQLite and Postgres.
    const rows = await prisma.$queryRaw<{ count: number | bigint; resetAt: bigint | number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${now + windowMs})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "resetAt" <= ${now} THEN 1 ELSE "count" + 1 END,
        "resetAt" = CASE WHEN "resetAt" <= ${now} THEN ${now + windowMs} ELSE "resetAt" END
      RETURNING "count", "resetAt"`;
    const count = Number(rows[0].count);
    const resetAt = Number(rows[0].resetAt);
    if (count > limit) {
      return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    }
    return { ok: true, remaining: limit - count, retryAfter: 0 };
  },

  async lockStatus(key: string, now: number): Promise<LockStatus> {
    const prisma = await db();
    const f = await prisma.loginFailure.findUnique({ where: { key } });
    const lockedUntil = Number(f?.lockedUntil ?? 0);
    if (lockedUntil > now) return { locked: true, retryAfter: Math.ceil((lockedUntil - now) / 1000) };
    return { locked: false, retryAfter: 0 };
  },

  async recordFailure(key: string, now: number): Promise<LockStatus> {
    const prisma = await db();
    // Step 1 (atomic): bump the failure count, restarting it when the previous
    // failure is older than the forgiveness window.
    const rows = await prisma.$queryRaw<{ count: number | bigint }[]>`
      INSERT INTO "LoginFailure" ("key", "count", "lastAt", "lockedUntil") VALUES (${key}, 1, ${now}, 0)
      ON CONFLICT ("key") DO UPDATE SET
        "count"  = CASE WHEN ${now} - "lastAt" > ${FAIL_WINDOW_MS} THEN 1 ELSE "count" + 1 END,
        "lastAt" = ${now}
      RETURNING "count"`;
    const count = Number(rows[0].count);
    // Step 2: extend the lock. Guarded so concurrent racers can only push the
    // deadline forward, never shorten it.
    if (count >= LOCK_THRESHOLD) {
      const until = now + lockDurationMs(count);
      await prisma.$executeRaw`
        UPDATE "LoginFailure" SET "lockedUntil" = ${until}
        WHERE "key" = ${key} AND "lockedUntil" < ${until}`;
      return { locked: true, retryAfter: Math.ceil(lockDurationMs(count) / 1000) };
    }
    return dbStore.lockStatus(key, now);
  },

  async clearFailures(key: string): Promise<void> {
    const prisma = await db();
    await prisma.loginFailure.deleteMany({ where: { key } });
  },
};

// ── Store selection & public (async) API ────────────────────────────────

function dbStoreEnabled(): boolean {
  const mode = process.env.RATE_LIMIT_STORE;
  if (mode === "db") return true;
  if (mode === "memory") return false;
  return process.env.NODE_ENV === "production";
}

/** Run a DB-store op, degrading to the memory store on DB failure. */
async function withFallback<T>(op: () => Promise<T>, fallback: () => T, what: string): Promise<T> {
  try {
    return await op();
  } catch (err) {
    console.error(`[ratelimit] ${what}: DB store failed — degrading to per-instance memory store`, err);
    return fallback();
  }
}

/** Fixed-window rate limit: at most `limit` hits per `windowMs` per key. */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateResult> {
  if (!dbStoreEnabled()) return memoryStore.hit(key, limit, windowMs, now);
  return withFallback(
    () => dbStore.hit(key, limit, windowMs, now),
    () => memoryStore.hit(key, limit, windowMs, now),
    "hit",
  );
}

/** Is this key currently locked out? (no mutation) */
export async function loginLockStatus(key: string, now = Date.now()): Promise<LockStatus> {
  if (!dbStoreEnabled()) return memoryStore.lockStatus(key, now);
  return withFallback(
    () => dbStore.lockStatus(key, now),
    () => memoryStore.lockStatus(key, now),
    "lockStatus",
  );
}

/** Record a failed login; returns the resulting lock status. */
export async function recordLoginFailure(key: string, now = Date.now()): Promise<LockStatus> {
  if (!dbStoreEnabled()) return memoryStore.recordFailure(key, now);
  return withFallback(
    () => dbStore.recordFailure(key, now),
    () => memoryStore.recordFailure(key, now),
    "recordFailure",
  );
}

/** Clear failures for a key after a successful login. */
export async function clearLoginFailures(key: string): Promise<void> {
  memoryStore.clearFailures(key); // also clear any degraded-mode state
  if (!dbStoreEnabled()) return;
  await withFallback(
    () => dbStore.clearFailures(key),
    () => undefined,
    "clearFailures",
  );
}

/** Purge expired windows & stale failure rows (called by the cleanup cron). */
export async function purgeExpiredRateLimits(now = Date.now()): Promise<{ rateLimits: number; loginFailures: number }> {
  if (!dbStoreEnabled()) return { rateLimits: 0, loginFailures: 0 };
  return withFallback(
    async () => {
      const prisma = await db();
      const rl = await prisma.rateLimit.deleteMany({ where: { resetAt: { lte: now } } });
      const lf = await prisma.loginFailure.deleteMany({
        where: { lastAt: { lte: now - FAIL_WINDOW_MS }, lockedUntil: { lte: now } },
      });
      return { rateLimits: rl.count, loginFailures: lf.count };
    },
    () => ({ rateLimits: 0, loginFailures: 0 }),
    "purge",
  );
}

// ── Client IP extraction (spoof-resistant) ───────────────────────────────

// Loose shape checks — enough to reject header junk, not full validation.
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:.]+$/i;

function normalizeIp(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // "[::1]:443" / "[::1]" → "::1"
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end === -1) return null;
    s = s.slice(1, end);
  } else if (s.includes(":") && IPV4.test(s.split(":")[0])) {
    s = s.split(":")[0]; // "1.2.3.4:5678" → "1.2.3.4"
  }
  if (IPV4.test(s)) {
    return s.split(".").every((o) => Number(o) <= 255) ? s : null;
  }
  if (s.includes(":") && IPV6.test(s)) return s.toLowerCase();
  return null;
}

/**
 * Client IP for rate-limit keys, resistant to X-Forwarded-For spoofing.
 *
 * Clients can PREPEND arbitrary values to XFF; only the last hop(s) — appended
 * by our own trusted proxy (Vercel edge, nginx, …) — are trustworthy. We take
 * the entry TRUSTED_PROXY_HOPS from the right (default 1: the value the proxy
 * in front of us appended). Junk that doesn't parse as an IP is ignored so an
 * attacker can't dodge limits by rotating garbage headers.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 1)) || 1);
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const chain = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const picked = chain[Math.max(0, chain.length - hops)];
    const ip = picked ? normalizeIp(picked) : null;
    if (ip) return ip;
  }
  const real = h.get("x-real-ip");
  if (real) {
    const ip = normalizeIp(real);
    if (ip) return ip;
  }
  return "local";
}
