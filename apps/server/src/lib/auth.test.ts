import { describe, it, expect, afterEach, vi } from "vitest";
import { jwtVerify } from "jose";
import { signSession, sessionVersionValid } from "./auth";

afterEach(() => vi.unstubAllEnvs());

const key = (s: string) => new TextEncoder().encode(s);

describe("signSession", () => {
  it("signs a JWT that verifies, carrying the payload and a ~30d expiry", async () => {
    const secret = "a-strong-test-secret-value-1234567890";
    vi.stubEnv("AUTH_SECRET", secret);
    const token = await signSession({ parentId: "p1", email: "a@b.co" });

    const { payload } = await jwtVerify(token, key(secret));
    expect(payload.parentId).toBe("p1");
    expect(payload.email).toBe("a@b.co");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    const ttl = (payload.exp as number) - (payload.iat as number);
    expect(ttl).toBeGreaterThanOrEqual(30 * 24 * 3600 - 5);
    expect(ttl).toBeLessThanOrEqual(30 * 24 * 3600 + 5);
  });

  it("is rejected by a different secret (signature is enforced)", async () => {
    vi.stubEnv("AUTH_SECRET", "secret-A-secret-A-secret-A-secret-A");
    const token = await signSession({ parentId: "p1", email: "a@b.co" });
    await expect(jwtVerify(token, key("secret-B-secret-B-secret-B-secret-B"))).rejects.toBeTruthy();
  });

  it("fails closed in production when AUTH_SECRET is the dev fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", undefined); // → the forbidden dev secret
    await expect(signSession({ parentId: "p1", email: "a@b.co" })).rejects.toThrow(/AUTH_SECRET/);
  });

  it("works in production once a real AUTH_SECRET is set", async () => {
    const secret = "prod-strong-secret-abcdefghijklmnop";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", secret);
    const token = await signSession({ parentId: "x", email: "y@z.co" });
    const { payload } = await jwtVerify(token, key(secret));
    expect(payload.parentId).toBe("x");
  });

  it("embeds tokenVersion (defaulting to 0 when omitted)", async () => {
    const secret = "tokenversion-test-secret-abcdefghij";
    vi.stubEnv("AUTH_SECRET", secret);
    const { payload: p0 } = await jwtVerify(await signSession({ parentId: "p", email: "a@b.co" }), key(secret));
    expect(p0.tokenVersion).toBe(0);
    const { payload: p5 } = await jwtVerify(await signSession({ parentId: "p", email: "a@b.co", tokenVersion: 5 }), key(secret));
    expect(p5.tokenVersion).toBe(5);
  });
});

describe("sessionVersionValid", () => {
  it("matches equal versions", () => {
    expect(sessionVersionValid(0, 0)).toBe(true);
    expect(sessionVersionValid(3, 3)).toBe(true);
  });

  it("treats a legacy token (no version) as version 0", () => {
    expect(sessionVersionValid(undefined, 0)).toBe(true); // grandfathered until first bump
    expect(sessionVersionValid(undefined, 1)).toBe(false); // after a bump, legacy tokens are out
  });

  it("rejects a stale version after a bump", () => {
    expect(sessionVersionValid(0, 1)).toBe(false);
    expect(sessionVersionValid(1, 2)).toBe(false);
  });
});
