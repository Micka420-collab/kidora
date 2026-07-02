// Signed policies — make offline enforcement tamper-proof.
//
// The agent caches the effective policy on disk so it can keep enforcing while
// the server is unreachable. A child with a standard account could, in theory,
// edit that cache to loosen the rules. To stop that we sign the policy with an
// **asymmetric** key: the server holds the Ed25519 PRIVATE key and signs; the
// agent pins only the PUBLIC key and verifies. Editing the cached policy breaks
// the signature, and the child cannot forge a new one without the private key.
//
// The key is derived deterministically from a server secret so every server
// instance (and every cold start) produces the SAME keypair — a signature made
// by one instance verifies against the public key pinned from any other.
import { createPrivateKey, createPublicKey, createHash, sign, verify, KeyObject } from "node:crypto";

// Fixed PKCS#8 prefix for a raw 32-byte Ed25519 seed (lets us build a private
// key deterministically from a hash, no key files to manage).
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function seedBytes(): Buffer {
  const raw =
    process.env.POLICY_SIGNING_SEED ||
    process.env.AUTH_SECRET ||
    // dev fallback — deterministic, NOT for production (same class as crypto.ts)
    "kidora-dev-policy-signing-seed";
  return createHash("sha256").update(raw).digest(); // exactly 32 bytes
}

let cache: { priv: KeyObject; pub: KeyObject } | null = null;
function keys(): { priv: KeyObject; pub: KeyObject } {
  if (cache) return cache;
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seedBytes()]);
  const priv = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  cache = { priv, pub };
  return cache;
}

/** The public key the agent pins, as base64 SPKI DER. */
export function policyPublicKeyBase64(): string {
  return (keys().pub.export({ format: "der", type: "spki" }) as Buffer).toString("base64");
}

/**
 * Sign a policy for a child. Returns the EXACT string that was signed
 * (`policySigned`) plus the signature — the agent verifies and then consumes
 * `policySigned` directly, so there is no cross-language canonicalization to get
 * wrong. `policyIssuedAt` lets the agent reject a replayed older policy.
 */
export function signedPolicyFields(
  policy: unknown,
  childId: string,
  issuedAt: number = Date.now(),
): { policySigned: string; policySig: string; policyIssuedAt: number; policyPublicKey: string } {
  const policySigned = JSON.stringify({ p: policy, cid: childId, iat: issuedAt });
  const policySig = sign(null, Buffer.from(policySigned, "utf8"), keys().priv).toString("base64");
  return { policySigned, policySig, policyIssuedAt: issuedAt, policyPublicKey: policyPublicKeyBase64() };
}

/** Verify an envelope (used in tests / defensive checks). */
export function verifyPolicyEnvelope(policySigned: string, policySig: string): boolean {
  try {
    return verify(null, Buffer.from(policySigned, "utf8"), keys().pub, Buffer.from(policySig, "base64"));
  } catch {
    return false;
  }
}

// Test seam: reset the cached keypair (e.g. after changing env in a test).
export function _resetKeyCacheForTests(): void {
  cache = null;
}
