/**
 * Effective pause state for a child. A child is paused when either an
 * indefinite manual pause is set, or a timed pause is still in the future.
 * Pure & unit-tested.
 */
export function isPausedNow(
  paused: boolean,
  pausedUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (paused) return true;
  if (!pausedUntil) return false;
  const until = typeof pausedUntil === "string" ? new Date(pausedUntil) : pausedUntil;
  return until.getTime() > now.getTime();
}

const MAX_PAUSE_MINUTES = 24 * 60; // a timed pause caps at 24h

/** Clamp a requested timed-pause duration (minutes) to a sane range, or null. */
export function clampPauseMinutes(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_PAUSE_MINUTES, Math.trunc(n));
}
