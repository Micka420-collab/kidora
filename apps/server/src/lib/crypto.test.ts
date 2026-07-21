import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted, hasStrongDataKey, tryDecrypt } from "./crypto";

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

describe("tryDecrypt (fail-closed for secrets)", () => {
  const original = process.env.DATA_ENC_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_ENC_KEY;
    else process.env.DATA_ENC_KEY = original;
  });

  it("round-trips like decrypt for a healthy key", () => {
    expect(tryDecrypt(encrypt("sk-or-abc123"))).toBe("sk-or-abc123");
  });

  it("passes legacy plaintext through unchanged", () => {
    expect(tryDecrypt("sk-or-plaintext")).toBe("sk-or-plaintext");
  });

  it("returns null after a DATA_ENC_KEY rotation — never the ciphertext", () => {
    process.env.DATA_ENC_KEY = "a".repeat(64);
    const enc = encrypt("sk-or-secret");
    process.env.DATA_ENC_KEY = "b".repeat(64); // rotated
    expect(decrypt(enc)).toBe(enc); // legacy decrypt hands back the blob…
    expect(tryDecrypt(enc)).toBeNull(); // …tryDecrypt refuses to
  });

  it("returns null for a tampered blob", () => {
    const enc = encrypt("secret");
    expect(tryDecrypt(enc.slice(0, -4) + "AAAA")).toBeNull();
  });
});

describe("hasStrongDataKey", () => {
  const original = process.env.DATA_ENC_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.DATA_ENC_KEY;
    else process.env.DATA_ENC_KEY = original;
  });

  it("is false when DATA_ENC_KEY is unset (dev fallback in use)", () => {
    delete process.env.DATA_ENC_KEY;
    expect(hasStrongDataKey()).toBe(false);
  });

  it("is false for a malformed / wrong-length key", () => {
    process.env.DATA_ENC_KEY = "too-short";
    expect(hasStrongDataKey()).toBe(false);
  });

  it("is true for a valid 32-byte hex key", () => {
    process.env.DATA_ENC_KEY = "a".repeat(64); // 32 bytes hex
    expect(hasStrongDataKey()).toBe(true);
  });

  it("is true for a valid 32-byte base64 key", () => {
    process.env.DATA_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(hasStrongDataKey()).toBe(true);
  });

  it("still round-trips regardless of which key is used", () => {
    process.env.DATA_ENC_KEY = "b".repeat(64);
    expect(decrypt(encrypt("secret"))).toBe("secret");
  });
});
