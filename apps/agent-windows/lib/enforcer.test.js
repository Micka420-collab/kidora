import { test } from "node:test";
import assert from "node:assert/strict";
import { isBedtimeNow } from "./enforcer.js";

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
