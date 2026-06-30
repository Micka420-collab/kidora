import { describe, it, expect } from "vitest";
import { vapidMisconfiguredInProd } from "./push";

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
