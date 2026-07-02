import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Load the REAL public/sw.js and execute its handlers in a mocked ServiceWorker
// environment, so we can assert the routing behaviour without a browser:
//   - navigations are network-first (fresh when online) and fall back to the
//     offline page when the network fails;
//   - /api/ requests are NEVER intercepted (dynamic/auth data always hits net);
//   - hashed static assets are cache-first.
const swSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "sw.js"), "utf8");

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadSw(fetchImpl: (req: any) => Promise<any>) {
  const handlers: Record<string, (e: any) => any> = {};
  const store = new Map<string, Map<string, any>>();
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const caches = {
    open: async (name: string) => ({
      addAll: async (urls: string[]) => urls.forEach((u) => cacheFor(name).set(u, { body: u, ok: true })),
      put: async (req: any, res: any) => cacheFor(name).set(typeof req === "string" ? req : req.url, res),
    }),
    match: async (req: any) => {
      const key = typeof req === "string" ? req : req.url;
      for (const c of store.values()) if (c.has(key)) return c.get(key);
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const self: any = {
    addEventListener: (type: string, fn: (e: any) => any) => (handlers[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    location: { origin: "http://localhost:3000" },
  };
  const ctx: any = { self, caches, fetch: fetchImpl, URL, Response, console, clients: self.clients };
  vm.createContext(ctx);
  vm.runInContext(swSource, ctx);
  return { handlers, caches };
}

async function dispatch(handler: (e: any) => any, event: any) {
  const waits: Promise<any>[] = [];
  let responded: Promise<any> | undefined;
  event.waitUntil = (p: Promise<any>) => waits.push(p);
  event.respondWith = (p: Promise<any>) => (responded = p);
  await handler(event);
  await Promise.all(waits);
  return { responded: responded ? await responded : undefined, intercepted: responded !== undefined };
}

describe("service worker routing", () => {
  it("precaches the offline page on install", async () => {
    const { handlers, caches } = loadSw(async () => ({ ok: true }));
    await dispatch(handlers.install, {});
    expect(await caches.match("/offline.html")).toBeTruthy();
  });

  it("navigations are network-first (fresh content when online)", async () => {
    const net = { ok: true, body: "FRESH" };
    const { handlers } = loadSw(async () => net);
    await dispatch(handlers.install, {});
    const { responded } = await dispatch(handlers.fetch, { request: { method: "GET", url: "http://localhost:3000/dashboard", mode: "navigate" } });
    expect(responded).toBe(net); // the live network response, not a cached one
  });

  it("navigations fall back to the offline page when the network fails", async () => {
    const { handlers } = loadSw(async () => { throw new Error("offline"); });
    await dispatch(handlers.install, {});
    const { responded } = await dispatch(handlers.fetch, { request: { method: "GET", url: "http://localhost:3000/dashboard", mode: "navigate" } });
    expect(responded).toEqual({ body: "/offline.html", ok: true }); // the precached offline page
  });

  it("NEVER intercepts /api/ requests (dynamic/auth data always hits the network)", async () => {
    const { handlers } = loadSw(async () => ({ ok: true }));
    await dispatch(handlers.install, {});
    const { intercepted } = await dispatch(handlers.fetch, { request: { method: "GET", url: "http://localhost:3000/api/children", mode: "cors" } });
    expect(intercepted).toBe(false);
  });

  it("does not intercept non-GET requests (mutations)", async () => {
    const { handlers } = loadSw(async () => ({ ok: true }));
    const { intercepted } = await dispatch(handlers.fetch, { request: { method: "POST", url: "http://localhost:3000/dashboard", mode: "navigate" } });
    expect(intercepted).toBe(false);
  });

  it("serves hashed static assets cache-first", async () => {
    const cached = { ok: true, body: "CACHED-CHUNK", clone: () => cached };
    let netCalls = 0;
    const { handlers, caches } = loadSw(async () => { netCalls++; return { ok: true, body: "NET-CHUNK", clone: () => ({}) }; });
    const url = "http://localhost:3000/_next/static/chunks/main-abc123.js";
    (await caches.open("kidora-v2")).put(url, cached);
    const { responded } = await dispatch(handlers.fetch, { request: { method: "GET", url, mode: "no-cors" } });
    expect(responded).toBe(cached); // served from cache
    expect(netCalls).toBe(0); // no network hit for an immutable hashed asset
  });
});
