import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { passwordStrength, passwordPolicyError, isPasswordBreached } from "./password-policy";

function hashParts(pw: string) {
  const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

describe("passwordStrength", () => {
  it("rates a common password very weak", () => {
    expect(passwordStrength("password").score).toBeLessThanOrEqual(1);
    expect(passwordStrength("kidora1234").score).toBeLessThanOrEqual(1);
  });

  it("rates short simple passwords low", () => {
    expect(passwordStrength("abc12345").score).toBeLessThanOrEqual(2);
  });

  it("rates a long mixed password high", () => {
    const s = passwordStrength("Tr0ub4dour&3xplorer!");
    expect(s.score).toBeGreaterThanOrEqual(3);
    expect(s.label.length).toBeGreaterThan(0);
  });

  it("penalizes sequences and repeats", () => {
    expect(passwordStrength("aaaaaaaaaaaa").score).toBeLessThanOrEqual(2);
    expect(passwordStrength("123456789012").score).toBeLessThanOrEqual(2);
  });

  it("returns score 0 with a prompt for an empty password", () => {
    const s = passwordStrength("");
    expect(s.score).toBe(0);
    expect(s.suggestions.length).toBeGreaterThan(0);
  });

  it("rewards length: a long random passphrase reaches the top score", () => {
    expect(passwordStrength("correct-horse-Battery-staple-9274").score).toBe(4);
  });
});

describe("isPasswordBreached (HIBP k-anonymity)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("flags a breached password and only sends the 5-char hash prefix", async () => {
    const pw = "password";
    const { prefix, suffix } = hashParts(pw);
    let calledUrl = "";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calledUrl = String(url);
      return { ok: true, text: async () => `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:42` };
    }));
    expect(await isPasswordBreached(pw)).toBe(true);
    // k-anonymity: only the prefix is sent; the full hash / suffix never leaves.
    expect(calledUrl).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
    expect(calledUrl).not.toContain(suffix);
  });

  it("returns false when the suffix is not in the range list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "AAAA:5\r\nBBBB:9" })));
    expect(await isPasswordBreached("some-unique-pw")).toBe(false);
  });

  it("ignores a suffix listed with a zero count", async () => {
    const { suffix } = hashParts("zerocount-pw");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => `${suffix}:0` })));
    expect(await isPasswordBreached("zerocount-pw")).toBe(false);
  });

  it("fails open (false) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "" })));
    expect(await isPasswordBreached("x")).toBe(false);
  });

  it("fails open (false) on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await isPasswordBreached("x")).toBe(false);
  });
});

describe("passwordPolicyError", () => {
  it("rejects too short", () => {
    expect(passwordPolicyError("abc")).toMatch(/8 caractères/);
  });
  it("rejects weak", () => {
    expect(passwordPolicyError("password")).toMatch(/faible/);
  });
  it("accepts a strong password", () => {
    expect(passwordPolicyError("Gr@ndChat-Bleu-2026!")).toBeNull();
  });
});
