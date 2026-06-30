import { timingSafeEqual } from "node:crypto";

/** Constant-time string equality (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Decide whether a cron request is authorized. Pure (no env / Request access) so
 * it can be unit-tested. Rules:
 *  - No secret configured → FAIL CLOSED in every environment. The cron routes can
 *    permanently delete telemetry (cleanup) or fan out emails to every parent
 *    (reports), so a self-host / dev deploy that forgets CRON_SECRET (and doesn't
 *    set NODE_ENV=production) must not leave them world-callable. Set CRON_SECRET
 *    to run crons locally.
 *  - Secret configured → the request must present it as the Bearer token or the
 *    `?key=` query value, compared in constant time.
 *
 * `isProduction` is accepted for backward compatibility but no longer affects the
 * decision (the no-secret case used to fail open outside production).
 */
export function isCronAuthorized(opts: {
  secret: string | undefined;
  bearer: string;
  key: string;
  isProduction?: boolean;
}): boolean {
  const { secret, bearer, key } = opts;
  if (!secret) return false; // fail closed: a CRON_SECRET must be configured
  return safeEqual(bearer, secret) || safeEqual(key, secret);
}
