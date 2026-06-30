import { describe, it, expect } from "vitest";
import { generateSecret, totp, verifyTotp, base32Encode, base32Decode, otpauthURL } from "./totp";

describe("totp", () => {
  it("base32 round-trips", () => {
    const b = Buffer.from("Hello Kidora!", "utf8");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });

  it("produces a stable 6-digit code for a fixed secret + time", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "utf8")); // RFC test key
    const code = totp(secret, 59 * 1000); // T=59s
    expect(code).toMatch(/^\d{6}$/);
    // deterministic: same inputs → same code
    expect(totp(secret, 59 * 1000)).toBe(code);
  });

  it("matches the official RFC 6238 (SHA-1) test vectors", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "utf8"));
    // 6-digit truncations of the RFC Appendix B 8-digit values.
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [t, expected] of vectors) {
      expect(totp(secret, t * 1000)).toBe(expected);
    }
  });

  it("verifies the current code and rejects a wrong one", () => {
    const secret = generateSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totp(secret, now), 1, now)).toBe(true);
    expect(verifyTotp(secret, "000000", 1, now)).toBe(false);
    expect(verifyTotp(secret, "abc", 1, now)).toBe(false);
  });

  it("tolerates ±1 step clock drift but not more", () => {
    const secret = generateSecret();
    const now = Date.now();
    const prev = totp(secret, now - 30 * 1000);
    const far = totp(secret, now - 90 * 1000);
    expect(verifyTotp(secret, prev, 1, now)).toBe(true);
    expect(verifyTotp(secret, far, 1, now)).toBe(false);
  });

  it("honours the window size (0 = strict, 2 = wider)", () => {
    const secret = generateSecret();
    const now = Date.now();
    const prev = totp(secret, now - 30 * 1000);
    const twoBack = totp(secret, now - 60 * 1000);
    // window 0 → only the current step is accepted
    expect(verifyTotp(secret, totp(secret, now), 0, now)).toBe(true);
    expect(verifyTotp(secret, prev, 0, now)).toBe(false);
    // window 2 → up to two steps of drift accepted
    expect(verifyTotp(secret, twoBack, 2, now)).toBe(true);
    expect(verifyTotp(secret, twoBack, 1, now)).toBe(false);
  });

  it("rejects malformed tokens (length, non-digits, empty)", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "1234567")).toBe(false);
    expect(verifyTotp(secret, "12 456")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
    expect(verifyTotp("", "123456")).toBe(false);
  });

  it("builds an otpauth URI", () => {
    const uri = otpauthURL("JBSWY3DPEHPK3PXP", "demo@kidora.app");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Kidora");
  });
});
