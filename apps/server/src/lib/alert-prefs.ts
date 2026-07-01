// Alert types a parent may mute. Safety-critical types (panic, risk) are
// intentionally NOT mutable, and NO critical-severity alert of any type is ever
// muted (see isAlertMuted) — so muting the noisy "keyword" warnings can never
// silence a self-harm/violence keyword hit, which is emitted at "critical".
export const MUTABLE_ALERT_TYPES = [
  "new_app",
  "limit_reached",
  "blocked_attempt",
  "geofence",
  "keyword",
  "device_offline",
] as const;

export type MutableAlertType = (typeof MUTABLE_ALERT_TYPES)[number];

const MUTABLE = new Set<string>(MUTABLE_ALERT_TYPES);

/** Parse the stored JSON prefs into a clean list of muted (mutable) types. */
export function parseMutedTypes(raw: string | null | undefined): MutableAlertType[] {
  if (!raw) return [];
  try {
    return sanitizeMutedTypes(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Keep only valid, de-duplicated mutable types (drops unknowns & safety types). */
export function sanitizeMutedTypes(types: unknown): MutableAlertType[] {
  if (!Array.isArray(types)) return [];
  const set = new Set<MutableAlertType>();
  for (const t of types) {
    if (typeof t === "string" && MUTABLE.has(t)) set.add(t as MutableAlertType);
  }
  return [...set];
}

/**
 * Whether an alert should be suppressed given the muted list.
 * - A `critical`-severity alert is NEVER muted (SOS, high risk, and self-harm /
 *   violence keyword hits) — muting the "keyword" category can only silence its
 *   warning-level entries (drugs/adult/bullying/dating/custom), never the
 *   critical ones.
 * - Otherwise only mutable types in the muted list are suppressed.
 */
export function isAlertMuted(mutedTypes: readonly string[], type: string, severity?: string): boolean {
  if (severity === "critical") return false;
  if (!MUTABLE.has(type)) return false;
  return mutedTypes.includes(type);
}
