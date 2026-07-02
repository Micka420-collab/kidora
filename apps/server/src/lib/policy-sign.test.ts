import { describe, it, expect, beforeEach } from "vitest";
import { createPublicKey, verify } from "node:crypto";
import {
  signedPolicyFields,
  policyPublicKeyBase64,
  verifyPolicyEnvelope,
  signAgentBundle,
  bundleHash,
  _resetKeyCacheForTests,
} from "./policy-sign";

beforeEach(() => {
  process.env.POLICY_SIGNING_SEED = "test-seed-abc";
  _resetKeyCacheForTests();
});

describe("policy signing", () => {
  it("produces a signature that verifies", () => {
    const policy = { paused: false, blockedDomains: ["x.com"], appRules: [] };
    const { policySigned, policySig } = signedPolicyFields(policy, "child-1", 1000);
    expect(verifyPolicyEnvelope(policySigned, policySig)).toBe(true);
  });

  it("tampering with the signed policy breaks verification", () => {
    const { policySigned, policySig } = signedPolicyFields({ paused: true }, "child-1", 1000);
    const tampered = policySigned.replace('"paused":true', '"paused":false');
    expect(tampered).not.toBe(policySigned);
    expect(verifyPolicyEnvelope(tampered, policySig)).toBe(false);
  });

  it("the pinned public key verifies exactly like the agent will (Ed25519, raw)", () => {
    const policy = { paused: false, appRules: [], blockedDomains: [] };
    const { policySigned, policySig, policyPublicKey } = signedPolicyFields(policy, "c", 42);
    // Reproduce the agent's verification path: import base64 SPKI DER, verify.
    const pub = createPublicKey({ key: Buffer.from(policyPublicKey, "base64"), format: "der", type: "spki" });
    const ok = verify(null, Buffer.from(policySigned, "utf8"), pub, Buffer.from(policySig, "base64"));
    expect(ok).toBe(true);
  });

  it("the signed envelope carries policy, childId and issuedAt", () => {
    const { policySigned, policyIssuedAt } = signedPolicyFields({ paused: true }, "kid-9", 777);
    const parsed = JSON.parse(policySigned);
    expect(parsed.cid).toBe("kid-9");
    expect(parsed.iat).toBe(777);
    expect(policyIssuedAt).toBe(777);
    expect(parsed.p).toEqual({ paused: true });
  });

  it("key derivation is deterministic for a fixed seed", () => {
    const a = policyPublicKeyBase64();
    _resetKeyCacheForTests();
    const b = policyPublicKeyBase64();
    expect(a).toBe(b);
  });

  it("signAgentBundle: signature verifies and hash binds to file content", () => {
    const files = { "agent.js": "QUJD", "lib/api.js": "REVG" };
    const { signed, sig } = signAgentBundle(files, "1.2.3");
    // The agent verifies the signature over `signed`…
    const pub = createPublicKey({ key: Buffer.from(policyPublicKeyBase64(), "base64"), format: "der", type: "spki" });
    expect(verify(null, Buffer.from(signed, "utf8"), pub, Buffer.from(sig, "base64"))).toBe(true);
    // …and that the manifest hash matches a recompute of the same files.
    const manifest = JSON.parse(signed);
    expect(manifest.v).toBe("1.2.3");
    expect(manifest.h).toBe(bundleHash(files));
    expect(bundleHash(files)).toBe(bundleHash({ "lib/api.js": "REVG", "agent.js": "QUJD" })); // order-independent
  });
});
