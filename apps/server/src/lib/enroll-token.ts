// Enrollment-token time-to-live.
//
// A device's enrollToken doubles as its permanent credential once the agent is
// enrolled, so expiry only applies while the device has NEVER enrolled: a token
// sitting unused in a forgotten ZIP/QR eventually dies, but an active device is
// never cut off. Enrolling clears the deadline; legacy rows (NULL) keep the old
// no-expiry behaviour.

const DEFAULT_TTL_HOURS = 72;

/** TTL for a fresh enrollment token, from ENROLL_TOKEN_TTL_HOURS (0 disables). */
export function enrollTokenTtlMs(env = process.env.ENROLL_TOKEN_TTL_HOURS): number {
  const n = Number(env);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TTL_HOURS * 3_600_000;
  return n * 3_600_000;
}

/** Deadline to stamp on a newly created (or regenerated) token; null = no TTL. */
export function newEnrollTokenExpiry(nowMs = Date.now()): Date | null {
  const ttl = enrollTokenTtlMs();
  return ttl > 0 ? new Date(nowMs + ttl) : null;
}

/**
 * True when this device's token can no longer be used to enroll. Only
 * never-enrolled devices expire; a NULL deadline never expires (legacy rows
 * and explicit TTL opt-out).
 */
export function isEnrollTokenExpired(
  device: { enrolled: boolean; enrollTokenExpiresAt: Date | null },
  nowMs = Date.now(),
): boolean {
  if (device.enrolled) return false;
  if (!device.enrollTokenExpiresAt) return false;
  return device.enrollTokenExpiresAt.getTime() < nowMs;
}

/** Same check over an API-serialized device row (client components). */
export function enrollTokenExpiredClient(d: {
  enrolled: boolean;
  enrollTokenExpiresAt: string | null;
}): boolean {
  return !d.enrolled && !!d.enrollTokenExpiresAt && new Date(d.enrollTokenExpiresAt).getTime() < Date.now();
}
