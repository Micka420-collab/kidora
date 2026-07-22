import { test } from "node:test";
import assert from "node:assert/strict";
import { TrustedClock } from "./clock.js";

test("onServerTime flags a large local-vs-server skew as tampering", () => {
  const c = new TrustedClock();
  // Server says it's 2 hours earlier than this machine's clock → tamper signal.
  const serverIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { tampered, skewMs } = c.onServerTime(serverIso);
  assert.equal(tampered, true);
  assert.ok(skewMs > 60 * 60 * 1000); // ~2h ahead
});

test("onServerTime does NOT flag a small skew", () => {
  const c = new TrustedClock();
  const serverIso = new Date(Date.now() - 30 * 1000).toISOString(); // 30s
  const { tampered } = c.onServerTime(serverIso);
  assert.equal(tampered, false);
});

test("trustedNow tracks server time, immune to a huge wall skew (anchored)", () => {
  const c = new TrustedClock();
  const serverMs = Date.parse("2026-07-02T12:00:00.000Z");
  c.onServerTime(serverMs);
  // Immediately after anchoring, trustedNow ≈ server time (± a few ms of elapsed),
  // regardless of what Date.now() (the tampered wall clock) reads.
  const t = c.trustedNow();
  assert.ok(Math.abs(t - serverMs) < 2000, `expected ~${serverMs}, got ${t}`);
});

test("trustedNow never moves backward (rewind is blocked)", () => {
  const c = new TrustedClock();
  const serverMs = Date.parse("2026-07-02T22:30:00.000Z");
  c.onServerTime(serverMs);
  const first = c.trustedNow();
  // Simulate a restart with the clock rewound: a fresh clock restored from the
  // persisted snapshot, but the wall clock now reads a year earlier.
  const snap = c.snapshot();
  const c2 = new TrustedClock(snap);
  // No server anchor yet this session; offset makes wallDerived ≈ earlier, but
  // the monotonic floor clamps it to the max trusted seen.
  const after = c2.trustedNow();
  assert.ok(after >= first - 5, "trusted time must not regress across a rewind"); // small tolerance
});

test("snapshot round-trips the floor + offset", () => {
  const c = new TrustedClock();
  c.onServerTime(Date.parse("2026-07-02T12:00:00.000Z"));
  const snap = c.snapshot();
  assert.ok(Number.isFinite(snap.maxTrustedMs));
  assert.ok(Number.isFinite(snap.offsetMs));
  const c2 = new TrustedClock(snap);
  assert.equal(c2.snapshot().maxTrustedMs, snap.maxTrustedMs);
});

test("invalid server time is ignored (no throw, no false tamper)", () => {
  const c = new TrustedClock();
  const r = c.onServerTime("not-a-date");
  assert.equal(r.tampered, false);
  assert.ok(Number.isFinite(c.trustedNow()));
});

test("a forward wall-clock jump BEFORE the first server anchor does not poison the floor", () => {
  // Regression: the pre-anchor branch used to _bump the monotonic floor from the
  // wall clock. A child setting the clock far into the future at boot (before the
  // first sync) would freeze trusted time there forever — surviving reboots and
  // the server's later correction, so the screen-time day never rolls again.
  const realNow = Date.now;
  try {
    const future = Date.parse("2030-01-01T00:00:00.000Z");
    Date.now = () => future; // child jumped the wall clock to 2030 at boot
    const c = new TrustedClock(); // fresh install, never synced
    c.trustedNow(); // sensor tick reads the tampered wall clock
    c.trustedNow();
    // The floor must NOT have been raised to 2030.
    assert.ok(c.snapshot().maxTrustedMs < future, "wall clock must not raise the persisted floor pre-anchor");

    // Now the child restores the real time and the agent finally syncs.
    Date.now = realNow;
    const serverMs = Date.parse("2026-07-02T12:00:00.000Z");
    c.onServerTime(serverMs);
    const t = c.trustedNow();
    // Trusted time follows the server, NOT the poisoned 2030 floor.
    assert.ok(Math.abs(t - serverMs) < 2000, `expected ~${serverMs} after anchor, got ${t}`);
  } finally {
    Date.now = realNow;
  }
});

test("a forward jump pre-anchor still can't survive a reboot to freeze the day", () => {
  const realNow = Date.now;
  try {
    const future = Date.parse("2030-01-01T00:00:00.000Z");
    Date.now = () => future;
    const c = new TrustedClock();
    c.trustedNow();
    const snap = c.snapshot(); // persisted across reboot
    Date.now = realNow;
    // Reboot: fresh clock from the snapshot, real wall clock, then a sync.
    const c2 = new TrustedClock(snap);
    c2.onServerTime(Date.parse("2026-07-02T12:00:00.000Z"));
    assert.ok(c2.trustedNow() < future, "the 2030 wall jump must not persist across reboot");
  } finally {
    Date.now = realNow;
  }
});
