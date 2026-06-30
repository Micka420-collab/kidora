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
 *  - No secret configured → allow only OUTSIDE production (local testing); in
 *    production a missing secret fails closed.
 *  - Secret configured → the request must present it as the Bearer token or the
 *    `?key=` query value, compared in constant time.
 */
export function isCronAuthorized(opts: {
  secret: string | undefined;
  isProduction: boolean;
  bearer: string;
  key: string;
}): boolean {
  const { secret, isProduction, bearer, key } = opts;
  if (!secret) return !isProduction;
  return safeEqual(bearer, secret) || safeEqual(key, secret);
}
