import { describe, it, expect } from "vitest";
import { rateLimit, clientIp } from "./ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = "test-key-a";
    expect(rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 2 });
    expect(rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 1 });
    expect(rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("test-key-b", 1, 60_000).ok).toBe(true);
    expect(rateLimit("test-key-b", 1, 60_000).ok).toBe(false);
    expect(rateLimit("test-key-c", 1, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = "test-key-d";
    expect(rateLimit(key, 1, 1).ok).toBe(true); // 1ms window
    // wait past the window
    const until = Date.now() + 5;
    while (Date.now() < until) { /* spin briefly */ }
    expect(rateLimit(key, 1, 1).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads x-forwarded-for first ip", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to local", () => {
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
