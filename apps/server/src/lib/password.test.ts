import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, randomToken, pairingCode } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips: the right password verifies, a wrong one doesn't", async () => {
    const hash = await hashPassword("Gr@ndChat-Bleu-2026!");
    expect(await verifyPassword("Gr@ndChat-Bleu-2026!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext and salts each hash differently", async () => {
    const pw = "same-password";
    const a = await hashPassword(pw);
    const b = await hashPassword(pw);
    expect(a).not.toContain(pw);
    expect(a).not.toBe(b); // distinct salts
    // both still verify
    expect(await verifyPassword(pw, a)).toBe(true);
    expect(await verifyPassword(pw, b)).toBe(true);
  });
});

describe("randomToken", () => {
  it("is URL-safe (no +, /, = and only base64url chars)", () => {
    for (let i = 0; i < 50; i++) {
      const t = randomToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("is effectively unique across calls", () => {
    const set = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(set.size).toBe(200);
  });

  it("grows with the requested byte length", () => {
    expect(randomToken(48).length).toBeGreaterThan(randomToken(8).length);
  });
});

describe("pairingCode", () => {
  it("matches XXXX-XXXX with an unambiguous alphabet (no I/O/0/1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = pairingCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it("is effectively unique across calls", () => {
    const set = new Set(Array.from({ length: 200 }, () => pairingCode()));
    expect(set.size).toBeGreaterThan(190); // allow a tiny chance of collision
  });
});
