import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isNewer, bundleHash, verifyBundle, isSafeEntryName, stageUpdate, verifyStagedDir } from "./updater.js";

test("isNewer compares dotted numeric versions", () => {
  assert.equal(isNewer("1.1.0", "1.0.9"), true);
  assert.equal(isNewer("1.0.0", "1.0.0"), false);
  assert.equal(isNewer("1.0.0", "1.1.0"), false);
  assert.equal(isNewer("2.0.0", "1.9.9"), true);
  assert.equal(isNewer("1.0.10", "1.0.9"), true);
});

test("bundleHash is order-independent and content-sensitive", () => {
  const a = bundleHash({ "a.js": "AA", "b.js": "BB" });
  const b = bundleHash({ "b.js": "BB", "a.js": "AA" });
  assert.equal(a, b);
  assert.notEqual(a, bundleHash({ "a.js": "AA", "b.js": "CC" }));
});

test("isSafeEntryName blocks traversal / absolute / drive paths", () => {
  assert.equal(isSafeEntryName("lib/api.js"), true);
  assert.equal(isSafeEntryName("agent.js"), true);
  assert.equal(isSafeEntryName("../evil.js"), false);
  assert.equal(isSafeEntryName("/etc/passwd"), false);
  assert.equal(isSafeEntryName("C:\\win\\x.js"), false);
  assert.equal(isSafeEntryName("lib/../../x"), false);
});

// Sign a bundle the way the server does, then verify + stage it.
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
function serverBundle(files, version) {
  const signed = JSON.stringify({ v: version, h: bundleHash(files) });
  const sig = sign(null, Buffer.from(signed, "utf8"), privateKey).toString("base64");
  return { version, signed, sig, files };
}

test("verifyBundle accepts a correctly-signed bundle", () => {
  const files = { "agent.js": Buffer.from("console.log(1)").toString("base64") };
  const pkg = serverBundle(files, "1.2.0");
  const out = verifyBundle(pkg, publicKey);
  assert.ok(out);
  assert.equal(out.version, "1.2.0");
});

test("verifyBundle rejects a tampered file (hash mismatch)", () => {
  const files = { "agent.js": Buffer.from("good").toString("base64") };
  const pkg = serverBundle(files, "1.2.0");
  pkg.files["agent.js"] = Buffer.from("EVIL").toString("base64"); // swap content, keep sig
  assert.equal(verifyBundle(pkg, publicKey), null);
});

test("verifyBundle rejects a wrong-key signature", () => {
  const other = generateKeyPairSync("ed25519");
  const files = { "agent.js": "AA" };
  const pkg = serverBundle(files, "1.2.0");
  assert.equal(verifyBundle(pkg, other.publicKey), null);
});

const STAGING = join(tmpdir(), `kidora-update-test-${process.pid}`);
afterEach(() => { try { rmSync(STAGING, { recursive: true, force: true }); } catch {} });

test("stageUpdate writes files + a .update-ready marker", () => {
  const files = {
    "agent.js": Buffer.from("// agent").toString("base64"),
    "lib/api.js": Buffer.from("// api").toString("base64"),
  };
  const { count } = stageUpdate(files, "1.3.0", STAGING);
  assert.equal(count, 2);
  assert.ok(existsSync(join(STAGING, "agent.js")));
  assert.ok(existsSync(join(STAGING, "lib", "api.js")));
  const marker = JSON.parse(readFileSync(join(STAGING, ".update-ready"), "utf8"));
  assert.equal(marker.version, "1.3.0");
  assert.equal(readFileSync(join(STAGING, "lib", "api.js"), "utf8"), "// api");
});

test("stageUpdate refuses an unsafe entry name", () => {
  assert.throws(() => stageUpdate({ "../evil.js": "AA" }, "1.0.0", STAGING), /unsafe/);
});

test("verifyStagedDir accepts a validly-signed staging dir (guardian re-check)", () => {
  const files = {
    "agent.js": Buffer.from("// agent").toString("base64"),
    "lib/api.js": Buffer.from("// api").toString("base64"),
  };
  const pkg = serverBundle(files, "2.0.0");
  stageUpdate(files, pkg.version, STAGING, { signed: pkg.signed, sig: pkg.sig });
  assert.equal(verifyStagedDir(STAGING, publicKey), true);
});

test("verifyStagedDir rejects a staged file tampered AFTER staging", () => {
  const files = { "agent.js": Buffer.from("good").toString("base64") };
  const pkg = serverBundle(files, "2.0.0");
  stageUpdate(files, pkg.version, STAGING, { signed: pkg.signed, sig: pkg.sig });
  writeFileSync(join(STAGING, "agent.js"), "EVIL PAYLOAD"); // attacker overwrites staged file
  assert.equal(verifyStagedDir(STAGING, publicKey), false);
});

test("verifyStagedDir rejects staging with no signature envelope", () => {
  stageUpdate({ "agent.js": "QQ==" }, "2.0.0", STAGING); // staged without meta → no sig
  assert.equal(verifyStagedDir(STAGING, publicKey), false);
});

test("verifyStagedDir rejects a wrong-key signature", () => {
  const files = { "agent.js": "QQ==" };
  const pkg = serverBundle(files, "2.0.0");
  stageUpdate(files, pkg.version, STAGING, { signed: pkg.signed, sig: pkg.sig });
  const other = generateKeyPairSync("ed25519");
  assert.equal(verifyStagedDir(STAGING, other.publicKey), false);
});
