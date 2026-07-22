import { test } from "node:test";
import assert from "node:assert/strict";
import { domainsForCategories, webDecision, normalizeDomain, categorizeDomain } from "./domains.js";

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

test("adult 'sex' signal does not match inside ordinary words (no false block)", () => {
  // Regression: "/sex/" matched the "ssex" in these legitimate hosts, so the
  // default-on adult filter sinkholed real universities / councils.
  for (const d of ["sussex.ac.uk", "essex.gov.uk", "middlesex.edu", "wessex.org.uk"]) {
    assert.equal(categorizeDomain(d), "unknown", `${d} must not be 'adult'`);
  }
  const w = web({ categories: ["adult"] });
  assert.equal(webDecision("sussex.ac.uk", w).action, "allow");
  assert.equal(webDecision("essex.gov.uk", w).action, "allow");
});

test("adult signal still catches genuine adult hosts", () => {
  for (const d of ["sex.com", "sexcam.net", "xvideos.com", "pornhub.com", "some-porn-tube.xyz"]) {
    assert.equal(categorizeDomain(d), "adult", `${d} must be 'adult'`);
  }
  const w = web({ categories: ["adult"] });
  assert.equal(webDecision("sex.com", w).action, "block");
  assert.equal(webDecision("xvideos.com", w).action, "block");
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

test("an explicit block on a SafeSearch domain BLOCKS it (block precedes SafeSearch)", () => {
  // Regression: SafeSearch was evaluated before the blocklist, so a parent who
  // blocked youtube.com but left SafeSearch on had it resolved (redirected)
  // instead of blocked — the explicit block silently downgraded.
  const w = web({ blocked: ["youtube.com"], safeSearch: true });
  assert.equal(webDecision("youtube.com", w).action, "block");
  assert.equal(webDecision("m.youtube.com", w).action, "block");
});

test("blocking the 'video' category also beats SafeSearch on youtube", () => {
  const w = web({ categories: ["video"], safeSearch: true });
  const d = webDecision("youtube.com", w);
  assert.equal(d.action, "block");
  assert.equal(d.reason, "category:video");
});

test("SafeSearch still redirects a non-blocked search domain", () => {
  // google.com isn't blocked → SafeSearch redirect still applies.
  const w = web({ safeSearch: true });
  const d = webDecision("google.com", w);
  assert.equal(d.action, "safesearch");
  assert.ok(d.target && d.target !== "google.com");
});
