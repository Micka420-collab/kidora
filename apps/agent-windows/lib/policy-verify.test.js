import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { importPublicKey, openSignedPolicy, LOCKDOWN_POLICY } from "./policy-verify.js";

// Mimic the server: an Ed25519 keypair; sign the same envelope shape.
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function serverSign(policy, cid, iat) {
  const policySigned = JSON.stringify({ p: policy, cid, iat });
  const policySig = sign(null, Buffer.from(policySigned, "utf8"), privateKey).toString("base64");
  return { policySigned, policySig };
}

test("a valid envelope opens to the trusted policy", () => {
  const pub = importPublicKey(pubB64);
  const { policySigned, policySig } = serverSign({ paused: false, appRules: [] }, "c1", 100);
  const out = openSignedPolicy({ policySigned, policySig, publicKey: pub, childId: "c1" });
  assert.ok(out);
  assert.equal(out.policy.paused, false);
  assert.equal(out.issuedAt, 100);
});

test("tampered policy fails verification (returns null)", () => {
  const pub = importPublicKey(pubB64);
  const { policySigned, policySig } = serverSign({ paused: true }, "c1", 100);
  const tampered = policySigned.replace('"paused":true', '"paused":false');
  const out = openSignedPolicy({ policySigned: tampered, policySig, publicKey: pub, childId: "c1" });
  assert.equal(out, null);
});

test("policy signed for another child is rejected", () => {
  const pub = importPublicKey(pubB64);
  const { policySigned, policySig } = serverSign({ paused: false }, "other", 100);
  const out = openSignedPolicy({ policySigned, policySig, publicKey: pub, childId: "c1" });
  assert.equal(out, null);
});

test("replay of an older policy is rejected by the issuedAt floor", () => {
  const pub = importPublicKey(pubB64);
  const { policySigned, policySig } = serverSign({ paused: false }, "c1", 50);
  // Floor is 100 (we've already seen a newer policy) → the old one is refused.
  const out = openSignedPolicy({ policySigned, policySig, publicKey: pub, childId: "c1", minIssuedAt: 100 });
  assert.equal(out, null);
});

test("a signature from a DIFFERENT key does not verify", () => {
  const other = generateKeyPairSync("ed25519");
  const otherPubB64 = other.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const pub = importPublicKey(otherPubB64); // pin the wrong key
  const { policySigned, policySig } = serverSign({ paused: false }, "c1", 100);
  const out = openSignedPolicy({ policySigned, policySig, publicKey: pub, childId: "c1" });
  assert.equal(out, null);
});

test("missing inputs are handled without throwing", () => {
  assert.equal(openSignedPolicy(), null);
  assert.equal(openSignedPolicy({ policySigned: "x", policySig: "y", publicKey: null }), null);
  assert.equal(importPublicKey("not-base64-der!!"), null);
});

test("LOCKDOWN_POLICY pauses everything (fail-safe on tamper)", () => {
  assert.equal(LOCKDOWN_POLICY.paused, true);
  assert.equal(LOCKDOWN_POLICY.webFilter.blockUnknown, true);
});
