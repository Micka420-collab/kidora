import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandLog } from "./command-dedup.js";

test("remembers an id and reports it as done", () => {
  const log = createCommandLog();
  assert.equal(log.has("cmd1"), false);
  log.remember("cmd1");
  assert.equal(log.has("cmd1"), true);
});

test("remember is idempotent (no duplicate ids in the snapshot)", () => {
  const log = createCommandLog();
  log.remember("cmd1");
  log.remember("cmd1");
  assert.deepEqual(log.snapshot(), ["cmd1"]);
});

test("ignores falsy ids", () => {
  const log = createCommandLog();
  log.remember(undefined);
  log.remember("");
  log.remember(null);
  assert.equal(log.has(undefined), false);
  assert.deepEqual(log.snapshot(), []);
});

test("restores from a persisted snapshot", () => {
  const log = createCommandLog(["a", "b", "c"]);
  assert.equal(log.has("b"), true);
  assert.equal(log.has("z"), false);
});

test("bounds the log to cap, evicting the oldest ids", () => {
  const log = createCommandLog([], 3);
  log.remember("1");
  log.remember("2");
  log.remember("3");
  log.remember("4"); // evicts "1"
  assert.equal(log.has("1"), false); // oldest dropped
  assert.equal(log.has("4"), true);
  assert.deepEqual(log.snapshot(), ["2", "3", "4"]);
});

test("restore also trims an over-cap snapshot to the most recent ids", () => {
  const log = createCommandLog(["1", "2", "3", "4", "5"], 3);
  assert.deepEqual(log.snapshot(), ["3", "4", "5"]);
  assert.equal(log.has("1"), false);
  assert.equal(log.has("5"), true);
});
