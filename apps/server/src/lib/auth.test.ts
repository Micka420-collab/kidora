import { describe, it, expect, afterEach, vi } from "vitest";
import { jwtVerify } from "jose";
import { signSession } from "./auth";

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
});
