import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeQuery, encodeAnnounce, parseMessage, isServerAnnounce, discover } from "./discover.js";

test("query encodes and parses back", () => {
  const o = parseMessage(encodeQuery());
  assert.equal(o.k, "kidora-discover");
  assert.equal(o.v, 1);
});

test("announce round-trips url + name", () => {
  const o = parseMessage(encodeAnnounce("http://192.168.1.50:3000", "Maison"));
  assert.ok(isServerAnnounce(o));
  assert.equal(o.url, "http://192.168.1.50:3000");
  assert.equal(o.name, "Maison");
});

test("parseMessage rejects junk and foreign packets", () => {
  assert.equal(parseMessage(Buffer.from("not json")), null);
  assert.equal(parseMessage(Buffer.from(JSON.stringify({ k: "something-else" }))), null);
});

test("isServerAnnounce requires an http(s) url", () => {
  assert.equal(isServerAnnounce(parseMessage(encodeAnnounce("ftp://x"))), false);
  assert.equal(isServerAnnounce({ k: "kidora-server", url: 123 }), false);
  assert.equal(isServerAnnounce(parseMessage(encodeAnnounce("https://kidora.fr"))), true);
});

test("discover resolves to an array within the timeout (best-effort, no server)", async () => {
  // With no advertiser on the LAN it should simply resolve empty, never hang/throw.
  const res = await discover({ timeoutMs: 300 });
  assert.ok(Array.isArray(res));
});
