// AES-256-GCM encryption for sensitive data at rest (e.g. screenshots).
// Backward-compatible: decrypt() returns non-encrypted input unchanged.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const PREFIX = "enc:v1:";

/** The configured 32-byte key from DATA_ENC_KEY (base64 or hex), or null if the
 *  env var is missing/invalid. */
function strongKey(): Buffer | null {
  const raw = process.env.DATA_ENC_KEY;
  if (!raw) return null;
  // accept base64 or hex; must resolve to exactly 32 bytes
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

/** True when a real DATA_ENC_KEY is configured — i.e. encryption at rest is NOT
 *  using the public dev fallback. Callers can warn when this is false and a
 *  genuine secret (e.g. an API key) is about to be stored. */
export function hasStrongDataKey(): boolean {
  return strongKey() !== null;
}

function key(): Buffer {
  return (
    strongKey() ??
    // dev fallback — deterministic 32-byte key (NOT for production)
    createHash("sha256").update("kidora-dev-data-key").digest()
  );
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  if (!payload?.startsWith(PREFIX)) return payload; // legacy/plaintext
  try {
    const buf = Buffer.from(payload.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return payload;
  }
}

export function isEncrypted(payload: string): boolean {
  return typeof payload === "string" && payload.startsWith(PREFIX);
}

/**
 * Fail-closed variant for SECRETS: null when an `enc:v1:` payload cannot be
 * decrypted (rotated/missing DATA_ENC_KEY, tampered blob) instead of returning
 * the ciphertext like decrypt() does. Without this, a rotated key silently sent
 * the raw `enc:v1:…` blob to OpenRouter as an Authorization header and every
 * risk-scoring call fell back to heuristics with zero signal to the parent.
 * Plaintext (legacy, un-prefixed) input still passes through unchanged.
 */
export function tryDecrypt(payload: string): string | null {
  const out = decrypt(payload);
  return isEncrypted(out) ? null : out;
}
