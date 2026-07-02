import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "./os.js";
import * as win from "./win.js";
import * as linux from "./linux.js";

const INTERFACE = [
  "startSensor", "killProcess", "lockWorkstation", "showOverlay", "hideOverlay",
  "notify", "getBattery", "getForegroundBrowserUrl", "captureScreen", "isAdmin",
  "updateHostsFile", "setSystemDns", "restoreSystemDns", "canRedirectDns",
];

test("os.js exposes the whole OS-integration interface", () => {
  for (const fn of INTERFACE) assert.equal(typeof os[fn], "function", `os.${fn}`);
});

test("win.js and linux.js both implement every interface function", () => {
  for (const fn of INTERFACE) {
    assert.equal(typeof win[fn], "function", `win.${fn}`);
    assert.equal(typeof linux[fn], "function", `linux.${fn}`);
  }
});

test("on win32, os.js dispatches to the Windows implementation", () => {
  if (process.platform !== "win32") return;
  assert.equal(os.startSensor, win.startSensor);
  assert.equal(os.canRedirectDns, win.canRedirectDns);
  assert.equal(os.canRedirectDns(), true); // Windows redirects system DNS to the proxy
});

test("Linux filters via hosts (canRedirectDns is false) — agent.js takes the hosts path", () => {
  assert.equal(linux.canRedirectDns(), false);
});

test("linux.js degrades gracefully when its Linux tools are absent (no throws)", async () => {
  assert.equal(await linux.getForegroundBrowserUrl(), "");
  assert.equal(await linux.getBattery(), null); // no /sys/class/power_supply here
  assert.equal(await linux.isAdmin(), typeof process.getuid === "function" ? process.getuid() === 0 : false);
  assert.equal(await linux.captureScreen(), null); // no screenshot tool
  // None of these may throw even with no Linux tools installed:
  await linux.killProcess("nothing.exe");
  await linux.notify("titre", "message");
  await linux.lockWorkstation();
  await linux.setSystemDns();
  await linux.restoreSystemDns();
  linux.hideOverlay();
  linux.showOverlay("Bloqué", "Temps d'écran terminé"); // no overlay tool → falls back to notify
  linux.hideOverlay();
});
