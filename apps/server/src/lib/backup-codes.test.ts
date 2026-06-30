import { describe, it, expect } from "vitest";
import {
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  consumeBackupCode,
  parseBackupHashes,
} from "./backup-codes";

describe("normalizeBackupCode", () => {
  it("uppercases and strips separators/spaces", () => {
    expect(normalizeBackupCode("ab2c-9xk4")).toBe("AB2C9XK4");
    expect(normalizeBackupCode("AB2C 9XK4")).toBe("AB2C9XK4");
    expect(normalizeBackupCode("AB2C9XK4")).toBe("AB2C9XK4");
  });
  it("returns empty for blank input", () => {
    expect(normalizeBackupCode("")).toBe("");
    expect(normalizeBackupCode("   ")).toBe("");
  });
});

describe("generateBackupCodes", () => {
  it("generates N unique codes with matching hashes", () => {
    const { codes, hashes } = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(hashes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8); // unique
    codes.forEach((c, i) => expect(hashes[i]).toBe(hashBackupCode(c)));
  });
  it("formats codes as two dash-separated groups from the safe alphabet", () => {
    for (const c of generateBackupCodes(5).codes) {
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(c).not.toMatch(/[01OIL]/); // ambiguous chars excluded
    }
  });
});

describe("consumeBackupCode", () => {
  it("consumes a matching code and removes exactly that hash", () => {
    const { codes, hashes } = generateBackupCodes(4);
    const remaining = consumeBackupCode(codes[1], hashes);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(3);
    expect(remaining).not.toContain(hashes[1]);
    expect(remaining).toContain(hashes[0]);
  });
  it("matches regardless of case/separators in the input", () => {
    const { codes, hashes } = generateBackupCodes(2);
    const messy = codes[0].toLowerCase().replace("-", " ");
    expect(consumeBackupCode(messy, hashes)).toHaveLength(1);
  });
  it("returns null for a wrong code (no 2FA bypass)", () => {
    const { hashes } = generateBackupCodes(3);
    expect(consumeBackupCode("ZZZZ-ZZZZ", hashes)).toBeNull();
    expect(consumeBackupCode("", hashes)).toBeNull();
    expect(consumeBackupCode("   ", hashes)).toBeNull();
  });
  it("cannot reuse a consumed code", () => {
    const { codes, hashes } = generateBackupCodes(3);
    const remaining = consumeBackupCode(codes[0], hashes)!;
    expect(consumeBackupCode(codes[0], remaining)).toBeNull(); // already gone
  });
  it("never matches against an empty hash list", () => {
    expect(consumeBackupCode("AB2C-9XK4", [])).toBeNull();
  });
});

describe("parseBackupHashes", () => {
  it("parses a JSON array of strings, defaulting to []", () => {
    expect(parseBackupHashes(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseBackupHashes(null)).toEqual([]);
    expect(parseBackupHashes("not json")).toEqual([]);
    expect(parseBackupHashes(JSON.stringify({}))).toEqual([]);
    expect(parseBackupHashes(JSON.stringify([1, "x", null]))).toEqual(["x"]);
  });
});
