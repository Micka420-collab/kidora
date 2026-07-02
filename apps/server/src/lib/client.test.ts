import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "./client";

afterEach(() => vi.unstubAllGlobals());

const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const errStatus = (status: number) => ({ ok: false, status, json: async () => ({ error: "boom" }) });

describe("api client retry semantics", () => {
  it("GET retries once on a network failure, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okJson({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await api.get("/x")).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("POST does NOT retry on a network failure (no double-submit)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.post("/x", { a: 1 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET retries once on a 5xx then returns the body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errStatus(503)).mockResolvedValueOnce(okJson({ v: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await api.get("/x")).toEqual({ v: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx (real client error) and surfaces its message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(422));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.get("/x")).rejects.toThrow("boom");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
