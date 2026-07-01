import { test } from "node:test";
import assert from "node:assert/strict";
import { Tracker } from "./tracker.js";

// Build a foreground sample for an app.
function fg(name, procId) {
  return { fg: { name, procId, title: `${name} window` } };
}

test("drain returns accumulated usage and clears deltas", () => {
  const t = new Tracker();
  t.tick(fg("chrome", 1), 30);
  t.tick(fg("chrome", 1), 30);
  const { usage } = t.drain();
  const chrome = usage.find((u) => u.appId === "chrome.exe");
  assert.equal(chrome.seconds, 60);
  // second drain is empty (deltas were cleared)
  assert.equal(t.drain().usage.length, 0);
});

test("restore merges a failed batch back so the next drain resends it", () => {
  const t = new Tracker();
  t.tick(fg("game", 1), 40);
  const first = t.drain(); // pretend this sync FAILED
  assert.equal(first.usage[0].seconds, 40);

  // more usage accrues before the next sync
  t.tick(fg("game", 1), 20);

  t.restore(first); // re-queue the failed batch
  const second = t.drain();
  const game = second.usage.find((u) => u.appId === "game.exe");
  // 40 (restored) + 20 (new) — nothing lost, screen time not under-counted
  assert.equal(game.seconds, 60);
});

test("restore preserves the original event timestamp on re-drain", () => {
  const t = new Tracker();
  t.tick(fg("chrome", 1), 5); // pushes app_open + new_app events
  const first = t.drain();
  const ts0 = first.events[0].ts;
  assert.ok(ts0);
  t.restore(first);
  const second = t.drain();
  assert.equal(second.events[0].ts, ts0); // same ts, not a fresh one
});

test("restore tolerates empty/undefined input", () => {
  const t = new Tracker();
  t.restore();
  t.restore({});
  assert.equal(t.drain().usage.length, 0);
});

test("todayByApp (for limits) is unaffected by drain/restore", () => {
  const t = new Tracker();
  t.tick(fg("game", 1), 50);
  t.drain();
  // draining telemetry deltas must not reset the daily limit counter
  assert.equal(t.todaySeconds("game.exe"), 50);
});
