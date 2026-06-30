import { describe, it, expect } from "vitest";
import { buildCommandRows } from "./commands";

const base = { childId: "c1", type: "lock", payload: "{}" };

describe("buildCommandRows", () => {
  it("targets exactly the given device when deviceId is set", () => {
    const rows = buildCommandRows({ ...base, deviceId: "d-phone", deviceIds: ["d-phone", "d-pc"] });
    expect(rows).toEqual([{ childId: "c1", deviceId: "d-phone", type: "lock", payload: "{}" }]);
  });

  it("fans a broadcast out to every enrolled device", () => {
    const rows = buildCommandRows({ ...base, deviceIds: ["d-phone", "d-pc"] });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.deviceId)).toEqual(["d-phone", "d-pc"]);
    expect(rows.every((r) => r.type === "lock" && r.childId === "c1")).toBe(true);
  });

  it("keeps a single unassigned row when no devices are enrolled yet", () => {
    const rows = buildCommandRows({ ...base, deviceIds: [] });
    expect(rows).toEqual([{ childId: "c1", deviceId: null, type: "lock", payload: "{}" }]);
  });

  it("ignores the device list when a deviceId is explicitly targeted", () => {
    const rows = buildCommandRows({ ...base, deviceId: "d-pc", deviceIds: [] });
    expect(rows).toEqual([{ childId: "c1", deviceId: "d-pc", type: "lock", payload: "{}" }]);
  });
});
