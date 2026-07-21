import { describe, it, expect } from "vitest";
import { vapidMisconfiguredInProd, pushErrorAction, isAllowedPushEndpoint } from "./push";

describe("isAllowedPushEndpoint (SSRF guard)", () => {
  it("accepts real push-service endpoints (all major browsers)", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz")).toBe(true);
    expect(isAllowedPushEndpoint("https://db5.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QABC")).toBe(true);
    expect(isAllowedPushEndpoint("https://android.googleapis.com/gcm/send/abc")).toBe(true);
  });

  it("rejects internal / SSRF targets", () => {
    expect(isAllowedPushEndpoint("http://169.254.169.254/latest/meta-data/")).toBe(false); // cloud metadata
    expect(isAllowedPushEndpoint("http://127.0.0.1:6379/")).toBe(false); // localhost service
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://10.0.0.5/internal")).toBe(false);
    expect(isAllowedPushEndpoint("https://[::1]/x")).toBe(false);
  });

  it("requires HTTPS and a real push host", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false); // not https
    expect(isAllowedPushEndpoint("https://evil.example.com/collect")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint("")).toBe(false);
  });

  it("is not fooled by look-alike hosts", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://notfcm.googleapis.com.attacker.net/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://push.apple.com.evil.com/x")).toBe(false);
  });
});

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
