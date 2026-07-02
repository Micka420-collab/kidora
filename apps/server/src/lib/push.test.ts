import { describe, it, expect } from "vitest";
import { vapidMisconfiguredInProd, pushErrorAction } from "./push";

describe("vapidMisconfiguredInProd", () => {
  it("is true in production when either VAPID key is missing", () => {
    expect(vapidMisconfiguredInProd({ NODE_ENV: "production" })).toBe(true);
    expect(vapidMisconfiguredInProd({ NODE_ENV: "production", VAPID_PUBLIC_KEY: "pub" })).toBe(true);
    expect(vapidMisconfiguredInProd({ NODE_ENV: "production", VAPID_PRIVATE_KEY: "priv" })).toBe(true);
  });

  it("is false in production when both keys are present", () => {
    expect(vapidMisconfiguredInProd({ NODE_ENV: "production", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" })).toBe(false);
  });

  it("is false outside production (dev may generate/persist a local keypair)", () => {
    expect(vapidMisconfiguredInProd({ NODE_ENV: "development" })).toBe(false);
    expect(vapidMisconfiguredInProd({})).toBe(false);
    expect(vapidMisconfiguredInProd({ NODE_ENV: "test" })).toBe(false);
  });
});

describe("pushErrorAction", () => {
  it("prunes an expired subscription (404/410) without retrying", () => {
    expect(pushErrorAction(404)).toBe("expired");
    expect(pushErrorAction(410)).toBe("expired");
  });

  it("retries transient failures (429, 5xx, network error)", () => {
    expect(pushErrorAction(429)).toBe("retry");
    expect(pushErrorAction(500)).toBe("retry");
    expect(pushErrorAction(503)).toBe("retry");
    expect(pushErrorAction(undefined)).toBe("retry"); // network/DNS error
  });

  it("gives up on a permanent client error (other 4xx)", () => {
    expect(pushErrorAction(400)).toBe("fail");
    expect(pushErrorAction(401)).toBe("fail");
    expect(pushErrorAction(413)).toBe("fail"); // payload too large — retrying won't help
  });
});
