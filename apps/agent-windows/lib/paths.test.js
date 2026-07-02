import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as paths from "./paths.js";

const saved = {
  KIDORA_DATA_DIR: process.env.KIDORA_DATA_DIR,
  ProgramData: process.env.ProgramData,
  PROGRAMDATA: process.env.PROGRAMDATA,
};

function setEnv(k, v) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

afterEach(() => {
  setEnv("KIDORA_DATA_DIR", saved.KIDORA_DATA_DIR);
  setEnv("ProgramData", saved.ProgramData);
  setEnv("PROGRAMDATA", saved.PROGRAMDATA);
  paths._resetForTests();
});

test("KIDORA_DATA_DIR override wins and drives every path", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kidora-paths-"));
  setEnv("KIDORA_DATA_DIR", tmp);
  paths._resetForTests();
  assert.equal(paths.dataDir(), tmp);
  assert.equal(paths.statePath(), join(tmp, "state.json"));
  assert.equal(paths.configPath(), join(tmp, "config.json"));
  assert.equal(paths.heartbeatPath(), join(tmp, "heartbeat.json"));
  assert.equal(paths.stagingDir(), join(tmp, ".update-staging"));
  rmSync(tmp, { recursive: true, force: true });
});

test("uses ProgramData/Kidora when there's no override", () => {
  setEnv("KIDORA_DATA_DIR", undefined);
  const tmp = mkdtempSync(join(tmpdir(), "kidora-pd-"));
  setEnv("ProgramData", tmp);
  paths._resetForTests();
  assert.equal(paths.dataDir(), join(tmp, "Kidora"));
  rmSync(tmp, { recursive: true, force: true });
});

test("falls back to the install dir when a data dir can't be created", () => {
  setEnv("KIDORA_DATA_DIR", undefined);
  // A NUL byte makes mkdirSync throw for every candidate, so probeWritable fails.
  const bad = "C:\kidora?<>invalid";
  setEnv("ProgramData", bad);
  setEnv("PROGRAMDATA", bad);
  paths._resetForTests();
  assert.equal(paths.dataDir(), paths.AGENT_DIR);
});

test("dataDir is cached (resolved once)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kidora-cache-"));
  setEnv("KIDORA_DATA_DIR", tmp);
  paths._resetForTests();
  const first = paths.dataDir();
  setEnv("KIDORA_DATA_DIR", join(tmpdir(), "elsewhere"));
  assert.equal(paths.dataDir(), first); // still the cached value
  rmSync(tmp, { recursive: true, force: true });
});
