import { describe, it, expect } from "vitest";
import { safeDate, capAlerts, type DraftAlert } from "./ingest";

const mk = (type: string, message: string, severity = "warning"): DraftAlert => ({
  parentId: "p1", childId: "c1", type, severity, message,
});

describe("safeDate", () => {
  it("parses a valid ISO timestamp", () => {
    expect(safeDate("2026-06-30T08:15:00Z").toISOString()).toBe("2026-06-30T08:15:00.000Z");
  });

  it("falls back to ~now for missing/empty input", () => {
    const before = Date.now();
    const d = safeDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(safeDate("").getTime()).toBeGreaterThanOrEqual(before);
    expect(safeDate(null).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("falls back to ~now for an unparseable timestamp (no Invalid Date)", () => {
    const before = Date.now();
    const d = safeDate("not-a-date");
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("never returns an Invalid Date for garbage that Date() partially accepts", () => {
    for (const bad of ["2026-13-99", "garbage", "🕒", "99999999999999999999"]) {
      expect(Number.isNaN(safeDate(bad).getTime())).toBe(false);
    }
  });
});

describe("capAlerts", () => {
  it("passes small batches through unchanged", () => {
    const a = [mk("blocked_attempt", "Site bloqué : a.com"), mk("new_app", "Nouvelle app : X")];
    expect(capAlerts(a)).toEqual(a);
  });

  it("drops exact (type+message) duplicates", () => {
    const a = [mk("geofence", "Arrivée à « École »"), mk("geofence", "Arrivée à « École »")];
    expect(capAlerts(a)).toHaveLength(1);
  });

  it("caps an over-threshold type and appends one summary", () => {
    const many = Array.from({ length: 20 }, (_, i) => mk("blocked_attempt", `Site bloqué : s${i}.com`));
    const out = capAlerts(many, 8);
    const blocked = out.filter((x) => x.type === "blocked_attempt");
    expect(blocked).toHaveLength(8); // 7 originals + 1 summary
    expect(blocked.at(-1)!.message).toBe("+13 autres tentatives bloquées"); // 20 - 7
    expect(blocked.slice(0, 7).every((x) => x.message.startsWith("Site bloqué"))).toBe(true);
  });

  it("caps each type independently and preserves order", () => {
    const a = [
      ...Array.from({ length: 10 }, (_, i) => mk("blocked_attempt", `b${i}`)),
      ...Array.from({ length: 2 }, (_, i) => mk("risk", `r${i}`, "critical")),
    ];
    const out = capAlerts(a, 8);
    expect(out.filter((x) => x.type === "blocked_attempt")).toHaveLength(8);
    expect(out.filter((x) => x.type === "risk")).toHaveLength(2);
    expect(out[0].type).toBe("blocked_attempt"); // order preserved
  });

  it("keeps the summary the same type so mute-prefs still apply", () => {
    const out = capAlerts(Array.from({ length: 12 }, (_, i) => mk("new_app", `app ${i}`)), 8);
    expect(out.every((x) => x.type === "new_app")).toBe(true);
  });
});
