// AES-256-GCM encryption for sensitive data at rest (e.g. screenshots).
// Backward-compatible: decrypt() returns non-encrypted input unchanged.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.DATA_ENC_KEY;
  if (raw) {
    // accept base64 or hex; normalize to 32 bytes via sha256 if needed
    const buf = /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }
  // dev fallback — deterministic 32-byte key (NOT for production)
  return createHash("sha256").update("kidora-dev-data-key").digest();
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
