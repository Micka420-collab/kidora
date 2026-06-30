import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { siteUrl } from "./site";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("siteUrl", () => {
  it("falls back to localhost when nothing is set", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("derives https from VERCEL_URL when present", () => {
    process.env.VERCEL_URL = "kidora-abc123.vercel.app";
    expect(siteUrl()).toBe("https://kidora-abc123.vercel.app");
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.VERCEL_URL = "kidora-abc123.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://kidora.app";
    expect(siteUrl()).toBe("https://kidora.app");
  });
});
