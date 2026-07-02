// Agent side of signed policies (see server src/lib/policy-sign.ts).
//
// The agent pins the server's Ed25519 PUBLIC key and verifies the signature over
// the exact `policySigned` string the server sent. It then consumes that string
// directly (no re-serialization → no canonicalization mismatch). A child editing
// the cached policy breaks the signature; forging a new one needs the private
// key, which never leaves the server.
import { createPublicKey, verify } from "node:crypto";

/** Import a pinned public key from base64 SPKI DER. Returns null on bad input. */
export function importPublicKey(base64Der) {
  if (!base64Der || typeof base64Der !== "string") return null;
  try {
    return createPublicKey({ key: Buffer.from(base64Der, "base64"), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

/**
 * Verify a signed policy envelope and return the trusted `{ policy, issuedAt }`,
 * or null if it can't be trusted. Enforces:
 *   - a valid Ed25519 signature over `policySigned`;
 *   - the child id matches (a policy signed for another child is rejected);
 *   - `issuedAt >= minIssuedAt` — blocks replaying an older, more permissive
 *     policy that was validly signed in the past (rollback protection).
 */
export function openSignedPolicy({ policySigned, policySig, publicKey, childId, minIssuedAt = 0 } = {}) {
  if (!policySigned || !policySig || !publicKey) return null;
  let ok = false;
  try {
    ok = verify(null, Buffer.from(policySigned, "utf8"), publicKey, Buffer.from(policySig, "base64"));
  } catch {
    return null;
  }
  if (!ok) return null;
  let env;
  try {
    env = JSON.parse(policySigned);
  } catch {
    return null;
  }
  if (!env || typeof env !== "object") return null;
  if (childId && env.cid && env.cid !== childId) return null;
  const issuedAt = typeof env.iat === "number" ? env.iat : 0;
  if (issuedAt < minIssuedAt) return null;
  return { policy: env.p, issuedAt };
}

// Fail-safe policy applied when the cached policy is present but its signature
// does NOT verify (i.e. someone tampered with state.json). Tampering makes the
// device MORE restricted, never less: everything is paused until a fresh,
// validly-signed policy arrives from the server.
export const LOCKDOWN_POLICY = Object.freeze({
  paused: true,
  blockedDomains: [],
  allowedDomains: [],
  appRules: [],
  webFilter: { blockUnknown: true, blockedCategories: [], safeSearch: true },
  screenTime: { enabled: false, dailyLimits: {}, bedtimes: [] },
});
