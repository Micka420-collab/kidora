import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDomain,
  registrableDomain,
  categorizeDomain,
  webDecision,
  webFilterConfigFromPolicy,
  webFilterNeeded,
} from "./webfilter";

test("normalizeDomain strips scheme, www, path, query, port", () => {
  assert.equal(normalizeDomain("https://www.YouTube.com/watch?v=1"), "youtube.com");
  assert.equal(normalizeDomain("m.youtube.com:443"), "m.youtube.com");
});

test("registrableDomain keeps the last two labels", () => {
  assert.equal(registrableDomain("cdn.videos.example.com"), "example.com");
  assert.equal(registrableDomain("example.com"), "example.com");
});

test("categorizeDomain: exact host, registrable domain, and keyword signals", () => {
  assert.equal(categorizeDomain("tiktok.com"), "social");
  assert.equal(categorizeDomain("cdn.tiktok.com"), "social"); // via registrable domain
  assert.equal(categorizeDomain("some-xxx-site.net"), "adult"); // via signal
  assert.equal(categorizeDomain("bet365casino.io"), "gambling");
  assert.equal(categorizeDomain("randomblog.example"), "unknown");
});

test("webDecision: allowlist wins over everything", () => {
  const d = webDecision("tiktok.com", { blockedCategories: ["social"], allowedDomains: ["tiktok.com"] });
  assert.deepEqual(d, { action: "allow", reason: "allowlist" });
});

test("webDecision: forced SafeSearch redirects search/video hosts", () => {
  const d = webDecision("www.google.com", { safeSearch: true });
  assert.equal(d.action, "safesearch");
  assert.equal((d as { target: string }).target, "forcesafesearch.google.com");
});

test("webDecision: blocks a blocked category", () => {
  const d = webDecision("reddit.com", { blockedCategories: ["social"] });
  assert.deepEqual(d, { action: "block", reason: "category:social" });
});

test("webDecision: blocks subdomains via the blocklist (suffix match)", () => {
  const d = webDecision("login.evil.example", { blockedDomains: ["evil.example"] });
  assert.deepEqual(d, { action: "block", reason: "blocklist" });
});

test("webDecision: blockUnknown blocks uncategorized hosts only", () => {
  assert.equal(webDecision("randomblog.example", { blockUnknown: true }).action, "block");
  assert.equal(webDecision("wikipedia.org", { blockUnknown: true }).action, "allow"); // known → education
});

test("webDecision: adult signal is blocked when 'adult' category is blocked", () => {
  const d = webDecision("free-porn-tube.xyz", { blockedCategories: ["adult"] });
  assert.equal(d.action, "block");
  assert.match(d.reason, /adult/);
});

test("webDecision: default allow when nothing matches", () => {
  assert.deepEqual(webDecision("wikipedia.org", { blockedCategories: ["social"] }), { action: "allow", reason: "ok" });
});

test("webFilterConfigFromPolicy: flattens the server policy, safeSearch defaults on", () => {
  const cfg = webFilterConfigFromPolicy({
    webFilter: { safeSearch: false, blockUnknown: true, blockedCategories: ["social", "games"] },
    blockedDomains: ["bad.example"],
    allowedDomains: ["ok.example"],
  });
  assert.deepEqual(cfg, {
    safeSearch: false,
    blockUnknown: true,
    blockedCategories: ["social", "games"],
    blockedDomains: ["bad.example"],
    allowedDomains: ["ok.example"],
  });
});

test("webFilterConfigFromPolicy: safe defaults for an empty/undefined policy", () => {
  const cfg = webFilterConfigFromPolicy(undefined);
  assert.deepEqual(cfg, {
    safeSearch: true,
    blockUnknown: false,
    blockedCategories: [],
    blockedDomains: [],
    allowedDomains: [],
  });
});

test("webFilterNeeded: true only when the filter would actually do something", () => {
  assert.equal(webFilterNeeded(webFilterConfigFromPolicy(undefined)), true); // safeSearch defaults on
  assert.equal(
    webFilterNeeded({ safeSearch: false, blockUnknown: false, blockedCategories: [], blockedDomains: [], allowedDomains: [] }),
    false,
  );
  assert.equal(
    webFilterNeeded({ safeSearch: false, blockUnknown: false, blockedCategories: ["social"], blockedDomains: [], allowedDomains: [] }),
    true,
  );
});
