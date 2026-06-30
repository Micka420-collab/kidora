import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// One-time 2FA recovery codes. We store only sha256 hashes of each code (the
// codes themselves are shown to the user once); a code is consumed (removed)
// when used so it can't be replayed.

const GROUPS = 2; // "ABCD-EFGH"
const GROUP_LEN = 4;
// Crockford-ish alphabet: no 0/O/1/I/L to avoid transcription mistakes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Normalize user input: strip non-alphanumerics, uppercase (so "abcd-efgh",
 *  "ABCDEFGH", "abcd efgh" all match the stored hash). */
export function normalizeBackupCode(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** sha256 hex of the normalized code. */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

function oneCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = "";
    const bytes = randomBytes(GROUP_LEN);
    for (let i = 0; i < GROUP_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
    groups.push(s);
  }
  return groups.join("-"); // e.g. "AB2C-9XK4"
}

/** Generate `count` fresh codes (plaintext to show once) + their hashes (to store). */
export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < count) {
    const c = oneCode();
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
  }
  return { codes, hashes: codes.map(hashBackupCode) };
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * If `input` matches one of the stored hashes, return the remaining hashes with
 * that one removed (the code is consumed). Returns null on no match. Empty/blank
 * input never matches.
 */
export function consumeBackupCode(input: string, hashes: string[]): string[] | null {
  const normalized = normalizeBackupCode(input);
  if (normalized.length === 0) return null;
  const target = hashBackupCode(normalized);
  let foundIdx = -1;
  // Scan all entries (don't short-circuit) for a steadier comparison time.
  for (let i = 0; i < hashes.length; i++) {
    if (typeof hashes[i] === "string" && hashes[i].length === target.length && safeEqualHex(hashes[i], target)) {
      foundIdx = i;
    }
  }
  if (foundIdx === -1) return null;
  return hashes.filter((_, i) => i !== foundIdx);
}

/** Parse the stored JSON column into a hash array (defensive). */
export function parseBackupHashes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw);
    return Array.isArray(o) ? o.filter((h) => typeof h === "string") : [];
  } catch {
    return [];
  }
}
