import { describe, it, expect } from "vitest";
import { getDict, isLocale, locales } from "./i18n";

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

describe("isLocale", () => {
  it("accepts the supported locales only", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });
  it("rejects anything else (case-sensitive, empty, undefined)", () => {
    expect(isLocale("es")).toBe(false);
    expect(isLocale("FR")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("getDict", () => {
  it("returns the matching dictionary", () => {
    expect(getDict("fr").nav.overview).toBe("Vue d'ensemble");
    expect(getDict("en").nav.overview).toBe("Overview");
  });
  it("falls back to French for an unknown locale", () => {
    // @ts-expect-error — exercising the runtime fallback with a bad value
    expect(getDict("zz").nav.overview).toBe("Vue d'ensemble");
  });
});

describe("locales", () => {
  it("lists fr and en", () => {
    expect([...locales]).toEqual(["fr", "en"]);
  });
});

describe("FR/EN dictionaries", () => {
  it("expose exactly the same set of keys (no missing/extra translations)", () => {
    const fr = keyPaths(getDict("fr")).sort();
    const en = keyPaths(getDict("en")).sort();
    expect(en).toEqual(fr);
  });

  it("have no empty translation strings", () => {
    for (const loc of locales) {
      const dict = getDict(loc) as unknown;
      const emptyPath = keyPaths(dict).find((p) => {
        const val = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
        return typeof val === "string" && val.trim() === "";
      });
      expect(emptyPath, `empty string at ${loc}:${emptyPath}`).toBeUndefined();
    }
  });
});
