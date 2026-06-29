import { describe, it, expect } from "vitest";
import { rateLimit, clientIp, recordLoginFailure, loginLockStatus, clearLoginFailures } from "./ratelimit";

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

describe("login lockout", () => {
  it("locks after 5 failures and clears on success", () => {
    const key = "lock-a";
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) expect(recordLoginFailure(key, t0).locked).toBe(false);
    const fifth = recordLoginFailure(key, t0);
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfter).toBeGreaterThan(0);
    expect(loginLockStatus(key, t0).locked).toBe(true);
    clearLoginFailures(key);
    expect(loginLockStatus(key, t0).locked).toBe(false);
  });

  it("lock grows with repeated failures but is capped", () => {
    const key = "lock-b";
    const t0 = 2_000_000;
    let last = 0;
    for (let i = 0; i < 12; i++) last = recordLoginFailure(key, t0).retryAfter;
    expect(last).toBeLessThanOrEqual(15 * 60); // capped at 15 min
    expect(last).toBeGreaterThan(60);
  });

  it("forgets stale failures after the window", () => {
    const key = "lock-c";
    for (let i = 0; i < 4; i++) recordLoginFailure(key, 3_000_000);
    // much later → counter resets, so one more failure is not a lock
    expect(recordLoginFailure(key, 3_000_000 + 31 * 60_000).locked).toBe(false);
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
