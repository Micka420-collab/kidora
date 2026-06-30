import { describe, it, expect } from "vitest";
import { sortDevicesByActivity } from "./devices-sort";

const d = (id: string, online: boolean, lastSeen: string | null, createdAt: string) =>
  ({ id, online, lastSeen, createdAt });

describe("sortDevicesByActivity", () => {
  it("puts online devices before offline ones", () => {
    const out = sortDevicesByActivity([
      d("off", false, "2026-06-30T08:00:00Z", "2026-01-01T00:00:00Z"),
      d("on", true, "2026-06-29T08:00:00Z", "2026-02-01T00:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["on", "off"]);
  });

  it("orders by most-recently-seen within the same online state", () => {
    const out = sortDevicesByActivity([
      d("old", true, "2026-06-30T06:00:00Z", "2026-01-01T00:00:00Z"),
      d("recent", true, "2026-06-30T09:00:00Z", "2026-01-02T00:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["recent", "old"]);
  });

  it("sorts never-seen devices after seen ones", () => {
    const out = sortDevicesByActivity([
      d("never", false, null, "2026-01-01T00:00:00Z"),
      d("seen", false, "2026-06-25T00:00:00Z", "2026-03-01T00:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["seen", "never"]);
  });

  it("falls back to oldest-created when neither has been seen", () => {
    const out = sortDevicesByActivity([
      d("newer", false, null, "2026-05-01T00:00:00Z"),
      d("older", false, null, "2026-01-01T00:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      d("off", false, null, "2026-01-01T00:00:00Z"),
      d("on", true, null, "2026-02-01T00:00:00Z"),
    ];
    const copy = [...input];
    sortDevicesByActivity(input);
    expect(input).toEqual(copy);
  });
});
