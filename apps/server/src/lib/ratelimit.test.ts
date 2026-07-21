import { describe, it, expect, afterEach } from "vitest";
import { rateLimit, clientIp, recordLoginFailure, loginLockStatus, clearLoginFailures } from "./ratelimit";

// These unit tests exercise the MEMORY store (the default outside production).
// The DB store is covered by ratelimit.db.integration.test.ts.

describe("rateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const key = "test-key-a";
    expect(await rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 2 });
    expect(await rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 1 });
    expect(await rateLimit(key, 3, 60_000)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks keys independently", async () => {
    expect((await rateLimit("test-key-b", 1, 60_000)).ok).toBe(true);
    expect((await rateLimit("test-key-b", 1, 60_000)).ok).toBe(false);
    expect((await rateLimit("test-key-c", 1, 60_000)).ok).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = "test-key-d";
    const t0 = 9_000_000;
    expect((await rateLimit(key, 1, 100, t0)).ok).toBe(true);
    expect((await rateLimit(key, 1, 100, t0 + 50)).ok).toBe(false); // still inside
    expect((await rateLimit(key, 1, 100, t0 + 101)).ok).toBe(true); // window over
  });
});

describe("login lockout", () => {
  it("locks after 5 failures and clears on success", async () => {
    const key = "lock-a";
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) expect((await recordLoginFailure(key, t0)).locked).toBe(false);
    const fifth = await recordLoginFailure(key, t0);
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfter).toBeGreaterThan(0);
    expect((await loginLockStatus(key, t0)).locked).toBe(true);
    await clearLoginFailures(key);
    expect((await loginLockStatus(key, t0)).locked).toBe(false);
  });

  it("lock grows with repeated failures but is capped", async () => {
    const key = "lock-b";
    const t0 = 2_000_000;
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await recordLoginFailure(key, t0)).retryAfter;
    expect(last).toBeLessThanOrEqual(15 * 60); // capped at 15 min
    expect(last).toBeGreaterThan(60);
  });

  it("forgets stale failures after the window", async () => {
    const key = "lock-c";
    for (let i = 0; i < 4; i++) await recordLoginFailure(key, 3_000_000);
    // much later → counter resets, so one more failure is not a lock
    expect((await recordLoginFailure(key, 3_000_000 + 31 * 60_000)).locked).toBe(false);
  });
});

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it("takes the LAST x-forwarded-for hop (the one our proxy appended)", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("5.6.7.8");
  });

  it("is not fooled by client-prepended (spoofed) XFF entries", () => {
    // The attacker sends "X-Forwarded-For: 6.6.6.6" and the trusted proxy
    // appends the REAL address → "6.6.6.6, 9.9.9.9". Keying on the spoofable
    // first entry would let one attacker rotate through unlimited keys.
    const req = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 9.9.9.9" } });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("honours TRUSTED_PROXY_HOPS for multi-proxy chains", () => {
    process.env.TRUSTED_PROXY_HOPS = "2"; // e.g. CDN + nginx, both trusted
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("ignores junk that does not parse as an IP", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "not-an-ip", "x-real-ip": "5.6.7.8" },
    });
    expect(clientIp(req)).toBe("5.6.7.8");
  });

  it("strips ports and brackets", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4:5678" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "[2001:db8::1]:443" } }))).toBe("2001:db8::1");
  });

  it("accepts plain IPv6", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "2001:DB8::1" } }))).toBe("2001:db8::1");
  });

  it("rejects out-of-range IPv4 octets", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "999.2.3.4" } });
    expect(clientIp(req)).toBe("local");
  });

  it("falls back to local", () => {
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
