import { describe, it, expect } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const SECRET = "s3cr3t-cron-key";

describe("isCronAuthorized", () => {
  it("with no secret: fails closed in every environment", () => {
    expect(isCronAuthorized({ secret: undefined, isProduction: false, bearer: "", key: "" })).toBe(false);
    expect(isCronAuthorized({ secret: "", isProduction: false, bearer: "", key: "" })).toBe(false);
    expect(isCronAuthorized({ secret: undefined, isProduction: true, bearer: "", key: "" })).toBe(false);
    expect(isCronAuthorized({ secret: undefined, bearer: "", key: "" })).toBe(false); // isProduction omitted
  });

  it("accepts the secret via the Bearer token", () => {
    expect(isCronAuthorized({ secret: SECRET, isProduction: true, bearer: SECRET, key: "" })).toBe(true);
  });

  it("accepts the secret via the ?key= query value", () => {
    expect(isCronAuthorized({ secret: SECRET, isProduction: true, bearer: "", key: SECRET })).toBe(true);
  });

  it("rejects a wrong or empty credential when a secret is set", () => {
    expect(isCronAuthorized({ secret: SECRET, isProduction: true, bearer: "nope", key: "nope" })).toBe(false);
    expect(isCronAuthorized({ secret: SECRET, isProduction: false, bearer: "", key: "" })).toBe(false);
    // a prefix of the secret must not pass (length-checked constant-time compare)
    expect(isCronAuthorized({ secret: SECRET, isProduction: true, bearer: SECRET.slice(0, -1), key: "" })).toBe(false);
  });
});
