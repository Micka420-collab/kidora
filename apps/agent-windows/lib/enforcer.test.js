import { test } from "node:test";
import assert from "node:assert/strict";
import { Enforcer, isBedtimeNow, effectiveLimitMinutes } from "./enforcer.js";

// A minimal tracker stub for the enforcer (only the two methods it calls).
function fakeTracker({ perApp = {}, total = 0 } = {}) {
  return {
    todaySeconds: (appId) => perApp[appId.toLowerCase()] ?? 0,
    totalTodaySeconds: () => total,
  };
}
// A sensor sample: foreground app + the set of running process names.
function sample(procs) {
  return { fg: { name: procs[0], procId: 1, title: "" }, procs };
}

// Helper: a local Date at a given weekday/hour/min. 2026-06-29 is a Monday, so
// dayOffset 0=Mon, 1=Tue, ... 6=Sun.
function at(dayOffset, h, m = 0) {
  return new Date(2026, 5, 29 + dayOffset, h, m, 0); // local time
}

const SCHOOL = [{ days: ["mon", "tue", "wed", "thu", "sun"], start: "21:00", end: "07:00" }];

test("overnight bedtime blocks the evening on an active day", () => {
  assert.equal(isBedtimeNow(SCHOOL, at(0, 22, 0)), true); // Mon 22:00
});

test("overnight bedtime keeps blocking past midnight (the window's start day was active)", () => {
  // Thu 21:00 → Fri 07:00. At Fri 02:00, the tail belongs to Thursday (active),
  // even though "fri" is not in days. Previously this wrongly stopped at midnight.
  assert.equal(isBedtimeNow(SCHOOL, at(4, 2, 0)), true); // Fri 02:00
});

test("overnight bedtime does NOT block the morning when the start day was inactive", () => {
  // Sat morning 02:00 is the tail of Friday night; "fri" is not in days → no block.
  assert.equal(isBedtimeNow(SCHOOL, at(5, 2, 0)), false); // Sat 02:00
});

test("single-day overnight rule blocks the correct morning (next calendar day)", () => {
  const monOnly = [{ days: ["mon"], start: "21:00", end: "07:00" }];
  assert.equal(isBedtimeNow(monOnly, at(0, 23, 0)), true); // Mon 23:00 — evening, active
  assert.equal(isBedtimeNow(monOnly, at(1, 6, 0)), true); // Tue 06:00 — tail of Mon night
  assert.equal(isBedtimeNow(monOnly, at(0, 6, 0)), false); // Mon 06:00 — NOT the tail of Mon
});

test("outside the window there is no block", () => {
  assert.equal(isBedtimeNow(SCHOOL, at(0, 12, 0)), false); // Mon noon
  assert.equal(isBedtimeNow(SCHOOL, at(0, 7, 0)), false); // exactly 07:00 → window is [.,07:00)
});

test("same-day window respects its day and bounds", () => {
  const nap = [{ days: ["wed"], start: "13:00", end: "15:00" }];
  assert.equal(isBedtimeNow(nap, at(2, 14, 0)), true); // Wed 14:00
  assert.equal(isBedtimeNow(nap, at(2, 15, 0)), false); // 15:00 excluded
  assert.equal(isBedtimeNow(nap, at(3, 14, 0)), false); // Thu — wrong day
});

test("empty days means every day", () => {
  const everyNight = [{ days: [], start: "22:00", end: "06:00" }];
  assert.equal(isBedtimeNow(everyNight, at(5, 3, 0)), true); // Sat 03:00 still blocks
});

// effectiveLimitMinutes — must mirror the server (computeScreenTimeToday) and the
// mobile client: a free day (no base limit) stays free even with a bonus grant.
test("effectiveLimitMinutes adds bonus to an existing daily limit", () => {
  assert.equal(effectiveLimitMinutes({ mon: 120 }, "mon", 30), 150);
});

test("effectiveLimitMinutes keeps a free day free even when a bonus was granted", () => {
  // No base limit for Sunday → the day is unlimited; a reward must NOT turn it
  // into a 30-min cap (the bug this guards against).
  assert.equal(effectiveLimitMinutes({ mon: 120 }, "sun", 30), 0);
});

test("effectiveLimitMinutes is 0 for a free day with no bonus", () => {
  assert.equal(effectiveLimitMinutes({}, "wed", 0), 0);
  assert.equal(effectiveLimitMinutes(undefined, "wed"), 0);
});

test("effectiveLimitMinutes returns the base when no bonus", () => {
  assert.equal(effectiveLimitMinutes({ fri: 90 }, "fri"), 90);
});

// ── apply() decision logic (dry-run: records events, performs no real kill) ──

test("apply blocks a running app with a block rule", async () => {
  const e = new Enforcer({ dryRun: true });
  const policy = { appRules: [{ appId: "roblox.exe", appName: "Roblox", action: "block" }] };
  await e.apply(policy, sample(["roblox", "chrome"]), fakeTracker());
  const ev = e.drainEvents();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "blocked");
  assert.equal(ev[0].title, "Roblox");
  assert.ok(ev[0].id); // stamped for exactly-once server dedup
});

test("apply does NOT block a rule whose app isn't running", async () => {
  const e = new Enforcer({ dryRun: true });
  const policy = { appRules: [{ appId: "roblox.exe", appName: "Roblox", action: "block" }] };
  await e.apply(policy, sample(["chrome", "code"]), fakeTracker());
  assert.equal(e.drainEvents().length, 0);
});

test("apply enforces a per-app limit only once the daily allowance is spent", async () => {
  const policy = { appRules: [{ appId: "steam.exe", appName: "Steam", action: "limit", dailyLimitMinutes: 60 }] };
  // under the limit → no block
  const under = new Enforcer({ dryRun: true });
  await under.apply(policy, sample(["steam"]), fakeTracker({ perApp: { "steam.exe": 59 * 60 } }));
  assert.equal(under.drainEvents().length, 0);
  // at/over the limit → blocked
  const over = new Enforcer({ dryRun: true });
  await over.apply(policy, sample(["steam"]), fakeTracker({ perApp: { "steam.exe": 60 * 60 } }));
  assert.equal(over.drainEvents().length, 1);
});

test("apply never kills a system process even if a rule targets it", async () => {
  const e = new Enforcer({ dryRun: true });
  const policy = { appRules: [{ appId: "explorer.exe", appName: "Explorer", action: "block" }] };
  await e.apply(policy, sample(["explorer"]), fakeTracker());
  assert.equal(e.drainEvents().length, 0);
});

test("apply raises the block overlay on pause and clears it when unpaused", async () => {
  const e = new Enforcer({ dryRun: true });
  await e.apply({ paused: true, appRules: [] }, sample(["chrome"]), fakeTracker());
  assert.equal(e.blocked, true);
  assert.equal(e.blockReason, "pause");
  await e.apply({ paused: false, appRules: [] }, sample(["chrome"]), fakeTracker());
  assert.equal(e.blocked, false);
});

test("apply blocks once the total daily screen-time limit is reached", async () => {
  const e = new Enforcer({ dryRun: true });
  const wd = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const policy = { appRules: [], screenTime: { enabled: true, dailyLimits: { [wd]: 60 } } };
  await e.apply(policy, sample(["chrome"]), fakeTracker({ total: 60 * 60 }));
  assert.equal(e.blocked, true);
  assert.equal(e.blockReason, "limit");
});
