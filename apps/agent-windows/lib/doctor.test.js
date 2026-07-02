import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS, checkNode, checkConfig, checkServer, checkHeartbeat, checkAdmin,
  checkStateWritable, checkTask, worstStatus, formatReport, runDoctor,
} from "./doctor.js";

test("checkNode passes on 18+, fails below", () => {
  assert.equal(checkNode("v20.1.0").status, STATUS.OK);
  assert.equal(checkNode("v18.0.0").status, STATUS.OK);
  assert.equal(checkNode("v16.20.0").status, STATUS.FAIL);
});

test("checkConfig flags missing token/server, warns when not enrolled", () => {
  assert.equal(checkConfig({}).status, STATUS.FAIL);
  assert.equal(checkConfig({ enrollToken: "t" }).status, STATUS.FAIL); // no server
  assert.equal(checkConfig({ enrollToken: "t", server: "http://x" }).status, STATUS.WARN); // no deviceId
  assert.equal(checkConfig({ enrollToken: "t", server: "http://x", deviceId: "d" }).status, STATUS.OK);
});

test("checkServer: ok on 200, warn on non-200, fail on network error", async () => {
  const ok = await checkServer("http://s", async () => ({ ok: true, status: 200 }));
  assert.equal(ok.status, STATUS.OK);
  const warn = await checkServer("http://s", async () => ({ ok: false, status: 503 }));
  assert.equal(warn.status, STATUS.WARN);
  const fail = await checkServer("http://s", async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(fail.status, STATUS.FAIL);
});

test("checkServer times out without hanging", async () => {
  // Simulate fetch: reject with AbortError when the caller's signal aborts.
  const never = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  const r = await checkServer("http://s", never, 30);
  assert.equal(r.status, STATUS.FAIL);
  assert.match(r.detail, /timeout/);
});

test("checkHeartbeat: fresh ok, stale warn, missing warn", () => {
  const now = 1_000_000;
  assert.equal(checkHeartbeat({ ts: now - 5000, pid: 1 }, now).status, STATUS.OK);
  assert.equal(checkHeartbeat({ ts: now - 5 * 60_000, pid: 1 }, now).status, STATUS.WARN);
  assert.equal(checkHeartbeat(null, now).status, STATUS.WARN);
});

test("checkTask: absent fails, present+running ok, present+stopped warn, unknown warn", () => {
  assert.equal(checkTask("X", false, false).status, STATUS.FAIL);
  assert.equal(checkTask("X", true, true).status, STATUS.OK);
  assert.equal(checkTask("X", true, false).status, STATUS.WARN);
  assert.equal(checkTask("X", null, false).status, STATUS.WARN);
});

test("worstStatus escalates fail > warn > ok", () => {
  assert.equal(worstStatus([{ status: "ok" }, { status: "warn" }]), STATUS.WARN);
  assert.equal(worstStatus([{ status: "ok" }, { status: "fail" }, { status: "warn" }]), STATUS.FAIL);
  assert.equal(worstStatus([{ status: "ok" }]), STATUS.OK);
});

test("runDoctor: healthy setup → exit 0, all checks present", async () => {
  const { results, exitCode, report } = await runDoctor({
    version: "v20.0.0",
    cfg: { enrollToken: "t", server: "http://s", deviceId: "d" },
    fetchImpl: async () => ({ ok: true, status: 200 }),
    heartbeat: { ts: Date.now(), pid: 42 },
    isAdmin: true,
    canWriteState: true,
    agentTask: { present: true, running: true },
    guardianTask: { present: true, running: true },
  });
  assert.equal(results.length, 8);
  assert.equal(exitCode, 0);
  assert.match(report, /opérationnel/);
});

test("runDoctor: unreachable server + missing task → exit 1", async () => {
  const { exitCode } = await runDoctor({
    version: "v20.0.0",
    cfg: { enrollToken: "t", server: "http://s", deviceId: "d" },
    fetchImpl: async () => { throw new Error("down"); },
    agentTask: { present: false, running: false },
  });
  assert.equal(exitCode, 1);
});

test("formatReport renders one line per check + a summary", () => {
  const report = formatReport([
    checkNode("v20.0.0"),
    checkAdmin(false),
    checkStateWritable(false),
  ]);
  assert.match(report, /Node\.js/);
  assert.match(report, /administrateur/);
  assert.match(report, /avertissements/); // warn summary
});
