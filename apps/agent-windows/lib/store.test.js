import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { loadState, saveState, STATE_PATH } from "./store.js";

function cleanup() {
  for (const p of [STATE_PATH, STATE_PATH + ".tmp"]) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
  }
}
afterEach(cleanup);

test("round-trips policy + tracker state through disk", () => {
  const saved = saveState({ policy: { paused: true }, tracker: { today: "2026-07-02", todayByApp: { "game.exe": 120 } } });
  assert.equal(saved, true);
  const back = loadState();
  assert.equal(back.policy.paused, true);
  assert.equal(back.tracker.todayByApp["game.exe"], 120);
});

test("loadState returns {} when no file exists", () => {
  cleanup();
  assert.deepEqual(loadState(), {});
});

test("loadState ignores a corrupt/half-written file (no throw, no wipe of enforcement)", () => {
  writeFileSync(STATE_PATH, "{ this is not json", "utf8");
  assert.deepEqual(loadState(), {}); // falls back to empty, never throws
});

test("loadState ignores a state file from an incompatible version", () => {
  writeFileSync(STATE_PATH, JSON.stringify({ v: 999, policy: { paused: true } }), "utf8");
  assert.deepEqual(loadState(), {});
});
