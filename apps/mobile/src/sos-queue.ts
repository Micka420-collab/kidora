// Offline SOS queue. If a child taps SOS while the device is offline, the panic
// must NOT be lost — we persist it and flush it (as a panic event, which the
// server turns into a critical alert) on the next successful sync. The stable id
// makes a re-flush idempotent (server dedups events by id).
import * as storage from "./storage";

export type QueuedSOS = { id: string; lat?: number; lng?: number; accuracy?: number; ts: string };

const MAX = 20; // cap so a long offline spell can't grow the store unbounded

/** A fresh, reasonably-unique id (used as the panic event's dedup key). */
export function newId(): string {
  return `sos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function list(): Promise<QueuedSOS[]> {
  try {
    const raw = await storage.get("sosQueue");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as QueuedSOS[]) : [];
  } catch {
    return [];
  }
}

export async function enqueue(entry: QueuedSOS): Promise<void> {
  const q = await list();
  q.push(entry);
  await storage.set("sosQueue", JSON.stringify(q.slice(-MAX)));
}

export async function removeIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const drop = new Set(ids);
  const q = (await list()).filter((e) => !drop.has(e.id));
  await storage.set("sosQueue", JSON.stringify(q));
}

/** Turn queued SOS into panic events for a sync (→ critical alerts server-side). */
export function toEvents(q: QueuedSOS[]) {
  return q.map((e) => ({
    id: e.id,
    type: "panic" as const,
    title: "SOS (différé)",
    detail: e.lat != null && e.lng != null ? JSON.stringify({ lat: e.lat, lng: e.lng }) : undefined,
  }));
}
