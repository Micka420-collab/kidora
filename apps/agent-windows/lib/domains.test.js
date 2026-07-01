import { test } from "node:test";
import assert from "node:assert/strict";
import { domainsForCategories, webDecision, normalizeDomain } from "./domains.js";

// Helper mirroring agent.js buildWeb's normalization.
function web({ blocked = [], allowed = [], categories = [], blockUnknown = false, safeSearch = false } = {}) {
  return {
    blockedDomains: new Set(blocked.map(normalizeDomain)),
    allowedDomains: new Set(allowed.map(normalizeDomain)),
    blockedCategories: new Set(categories),
    blockUnknown,
    safeSearch,
  };
}

test("domainsForCategories expands a category to its known domains", () => {
  const social = domainsForCategories(["social"]);
  assert.ok(social.includes("facebook.com"));
  assert.ok(social.includes("instagram.com"));
  assert.ok(social.includes("tiktok.com"));
  assert.ok(!social.includes("youtube.com")); // that's "video", not "social"
});

test("domainsForCategories accepts a Set and returns [] for empty input", () => {
  assert.deepEqual(domainsForCategories([]), []);
  assert.deepEqual(domainsForCategories(new Set()), []);
  assert.ok(domainsForCategories(new Set(["video"])).includes("youtube.com"));
});

test("webDecision blocks a domain in a blocked category (incl. subdomains)", () => {
  const w = web({ categories: ["social"] });
  assert.equal(webDecision("instagram.com", w).action, "block");
  assert.equal(webDecision("m.instagram.com", w).action, "block"); // suffix match
});

test("webDecision: whitelist mode does NOT sinkhole the agent's own server (self-lockout guard)", () => {
  // Simulates agent.js folding the server host into allowedDomains.
  const w = web({ allowed: ["kidora-x.vercel.app", "localhost", "127.0.0.1"], blockUnknown: true });
  assert.equal(webDecision("kidora-x.vercel.app", w).action, "allow");
  assert.equal(webDecision("localhost", w).action, "allow");
  // A genuinely unknown host is still blocked in whitelist mode.
  assert.equal(webDecision("some-random-site.example", w).action, "block");
});

test("webDecision allows normal traffic when nothing matches", () => {
  assert.equal(webDecision("wikipedia.org", web()).action, "allow");
});
