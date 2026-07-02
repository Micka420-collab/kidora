// Agent self-update — download a NEWER agent version, verify it's genuinely from
// our server (Ed25519 signature over a content hash), and STAGE it. The actual
// swap-into-place is done by the SYSTEM guardian (which has the rights to replace
// the ACL-protected files) with a backup for rollback — running code never
// overwrites itself mid-flight.
//
// Safety properties:
//   - nothing is trusted without a valid signature from the pinned server key;
//   - the signature binds to a hash of ALL files, so no file can be swapped;
//   - staging is separate from the live dir, and the guardian keeps a backup.
import { createHash, verify } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";

/** Semver-ish "is remote strictly newer than local?" (numeric dotted parts). */
export function isNewer(remote, local) {
  const a = String(remote || "").split(".").map((n) => parseInt(n, 10) || 0);
  const b = String(local || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** Deterministic hash of a {name: base64} file map (order-independent). */
export function bundleHash(files) {
  const h = createHash("sha256");
  for (const name of Object.keys(files).sort()) h.update(`${name}:${files[name]}\n`);
  return h.digest("hex");
}

/**
 * Verify a downloaded bundle `{ signed, sig, files }` against the pinned public
 * key. `signed` is the exact string the server signed: `{"v":version,"h":hash}`.
 * Returns `{ version, files }` when trustworthy, else null.
 */
export function verifyBundle(pkg, publicKey) {
  if (!pkg || !publicKey || !pkg.signed || !pkg.sig || !pkg.files) return null;
  let ok = false;
  try {
    ok = verify(null, Buffer.from(pkg.signed, "utf8"), publicKey, Buffer.from(pkg.sig, "base64"));
  } catch {
    return null;
  }
  if (!ok) return null;
  let manifest;
  try {
    manifest = JSON.parse(pkg.signed);
  } catch {
    return null;
  }
  if (!manifest || manifest.h !== bundleHash(pkg.files)) return null; // signature binds to content
  return { version: manifest.v, files: pkg.files };
}

/** Reject path-traversal / absolute entries in a bundle file map. */
export function isSafeEntryName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !name.startsWith("/") &&
    !name.startsWith("\\") &&
    !/^[a-zA-Z]:/.test(name) && // drive letter
    !name.split(/[\\/]/).includes("..")
  );
}

/**
 * Write a verified bundle to a fresh staging dir and drop a `.update-ready`
 * marker naming the target version. The guardian reads the marker and swaps.
 * Returns { stagingDir, count }.
 */
export function stageUpdate(files, version, stagingDir, meta = {}) {
  if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  let count = 0;
  for (const [name, b64] of Object.entries(files)) {
    if (!isSafeEntryName(name)) throw new Error(`unsafe bundle entry: ${name}`);
    const dest = join(stagingDir, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(b64, "base64"));
    count++;
  }
  // Persist the server's signature envelope in the marker so the SYSTEM guardian
  // can RE-VERIFY the staged files against the pinned key before swapping — even
  // if the staging dir were somehow writable, unsigned/tampered files are refused.
  writeFileSync(
    join(stagingDir, ".update-ready"),
    JSON.stringify({ version, at: new Date().toISOString(), count, signed: meta.signed, sig: meta.sig }),
    "utf8",
  );
  return { stagingDir, count };
}

/** Recursively read a staged dir into a {relativeName: base64} map (excludes the
 *  marker). Matches the shape `bundleHash`/`verifyBundle` expect. */
function collectStagedFiles(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectStagedFiles(full, base, out);
    } else {
      const rel = relative(base, full).split(sep).join("/");
      if (rel === ".update-ready") continue;
      out[rel] = readFileSync(full).toString("base64");
    }
  }
  return out;
}

/**
 * Re-verify a staged update against the pinned public key: the marker's signed
 * envelope must have a valid server signature AND its content hash must match
 * the files actually on disk. Used by the guardian right before the swap, so a
 * tampered/planted staging dir is rejected regardless of filesystem ACLs.
 */
export function verifyStagedDir(stagingDir, publicKey) {
  try {
    const marker = JSON.parse(readFileSync(join(stagingDir, ".update-ready"), "utf8"));
    if (!marker.signed || !marker.sig || !publicKey) return false;
    const files = collectStagedFiles(stagingDir);
    return verifyBundle({ signed: marker.signed, sig: marker.sig, files }, publicKey) !== null;
  } catch {
    return false;
  }
}
