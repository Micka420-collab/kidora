import { createHmac, randomBytes } from "node:crypto";

// RFC 6238 TOTP (Google Authenticator compatible) — dependency-free.
// SHA-1, 6 digits, 30s period. Secrets are base32 (RFC 4648, no padding).

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = (s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** New random base32 secret (default 20 bytes → 160 bits). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** Compute the TOTP code for a base32 secret at time `t` (ms). */
export function totp(secret: string, t: number = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

/** Verify a token, tolerating ±`window` steps of clock drift. */
export function verifyTotp(secret: string, token: string, window = 1, now: number = Date.now()): boolean {
  if (!secret || !/^\d{6}$/.test((token || "").trim())) return false;
  const t = token.trim();
  for (let w = -window; w <= window; w++) {
    if (totp(secret, now + w * 30 * 1000) === t) return true;
  }
  return false;
}

/** otpauth:// URI for QR enrolment in authenticator apps. */
export function otpauthURL(secret: string, account: string, issuer = "Kidora"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
