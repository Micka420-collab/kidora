// Alert types a parent may mute. Safety-critical types (panic, risk) are
// intentionally NOT mutable and are always delivered.
export const MUTABLE_ALERT_TYPES = [
  "new_app",
  "limit_reached",
  "blocked_attempt",
  "geofence",
  "keyword",
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
 * Whether an alert of `type` should be suppressed given the muted list.
 * Non-mutable (safety / unknown) types are never muted.
 */
export function isAlertMuted(mutedTypes: readonly string[], type: string): boolean {
  if (!MUTABLE.has(type)) return false;
  return mutedTypes.includes(type);
}
