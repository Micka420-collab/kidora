// In-memory mock of the secure-store wrapper so the offline SOS queue can be
// tested without native storage.
jest.mock("./storage", () => {
  const mem: Record<string, string> = {};
  return {
    get: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
    set: jest.fn(async (k: string, v: string) => { mem[k] = v; }),
    __mem: mem,
  };
});

import * as sosQueue from "./sos-queue";

beforeEach(async () => {
  // Clear the queue between tests.
  await sosQueue.removeIds((await sosQueue.list()).map((e) => e.id));
});

describe("sos-queue", () => {
  it("newId is unique-ish and prefixed", () => {
    const a = sosQueue.newId();
    const b = sosQueue.newId();
    expect(a).toMatch(/^sos-/);
    expect(a).not.toBe(b);
  });

  it("enqueue then list round-trips", async () => {
    await sosQueue.enqueue({ id: "s1", ts: "t", lat: 1, lng: 2 });
    const q = await sosQueue.list();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: "s1", lat: 1, lng: 2 });
  });

  it("removeIds drops only the named entries", async () => {
    await sosQueue.enqueue({ id: "s1", ts: "t" });
    await sosQueue.enqueue({ id: "s2", ts: "t" });
    await sosQueue.removeIds(["s1"]);
    const q = await sosQueue.list();
    expect(q.map((e) => e.id)).toEqual(["s2"]);
  });

  it("caps the queue at 20 (keeps the most recent)", async () => {
    for (let i = 0; i < 25; i++) await sosQueue.enqueue({ id: `s${i}`, ts: "t" });
    const q = await sosQueue.list();
    expect(q).toHaveLength(20);
    expect(q[0].id).toBe("s5"); // oldest five dropped
    expect(q[q.length - 1].id).toBe("s24");
  });

  it("toEvents maps to panic events, encoding location only when present", () => {
    const events = sosQueue.toEvents([
      { id: "s1", ts: "t", lat: 48.8, lng: 2.3 },
      { id: "s2", ts: "t" },
    ]);
    expect(events[0]).toMatchObject({ id: "s1", type: "panic", title: "SOS (différé)" });
    expect(JSON.parse(events[0].detail as string)).toEqual({ lat: 48.8, lng: 2.3 });
    expect(events[1].detail).toBeUndefined();
  });

  it("list tolerates corrupt storage (returns [])", async () => {
    const storage = require("./storage");
    await storage.set("sosQueue", "{not json");
    expect(await sosQueue.list()).toEqual([]);
  });
});
