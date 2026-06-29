import { describe, it, expect } from "vitest";
import { passwordStrength, passwordPolicyError } from "./password-policy";

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
