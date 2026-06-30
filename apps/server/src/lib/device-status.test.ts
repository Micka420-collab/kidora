import { describe, it, expect } from "vitest";
import { isDeviceOnline, ONLINE_WINDOW_MS } from "./device-status";

const now = 1_000_000_000_000;
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("isDeviceOnline", () => {
  it("is online only when flag is set AND it reported within the window", () => {
    expect(isDeviceOnline({ online: true, lastSeen: ago(30_000) }, now)).toBe(true);
  });

  it("is offline when the last report is older than the window (stale flag)", () => {
    // The classic bug: online flag stuck true but the device went away.
    expect(isDeviceOnline({ online: true, lastSeen: ago(ONLINE_WINDOW_MS + 1) }, now)).toBe(false);
  });

  it("is offline when the device explicitly reported offline", () => {
    expect(isDeviceOnline({ online: false, lastSeen: ago(1_000) }, now)).toBe(false);
  });

  it("is offline when it has never been seen", () => {
    expect(isDeviceOnline({ online: true, lastSeen: null }, now)).toBe(false);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(isDeviceOnline({ online: true, lastSeen: new Date(now - 10_000) }, now)).toBe(true);
  });

  it("treats the exact window boundary as offline", () => {
    expect(isDeviceOnline({ online: true, lastSeen: ago(ONLINE_WINDOW_MS) }, now)).toBe(false);
  });
});
