import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "./crypto";

describe("crypto (AES-256-GCM at rest)", () => {
  it("round-trips a value", () => {
    const plain = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(decrypt(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encrypt("hello")).not.toBe(encrypt("hello"));
  });

  it("passes plaintext/legacy values through unchanged", () => {
    expect(decrypt("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(isEncrypted("not-encrypted")).toBe(false);
  });

  it("does not return the plaintext for tampered ciphertext (GCM auth)", () => {
    const enc = encrypt("secret");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered)).not.toThrow();
    // Auth-tag failure must NOT yield the original plaintext.
    expect(decrypt(tampered)).not.toBe("secret");
  });

  it("round-trips unicode and empty strings", () => {
    for (const s of ["", "Léa 🧒 café — naïve", "a".repeat(5000)]) {
      expect(decrypt(encrypt(s))).toBe(s);
    }
  });
});
