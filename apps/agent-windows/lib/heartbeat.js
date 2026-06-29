// Liveness heartbeat: the agent writes { ts, pid } periodically so the SYSTEM
// guardian can tell a *hung* agent (process alive but stuck) from a healthy one
// and restart it. Stored next to config.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HEARTBEAT_PATH = join(__dirname, "..", "heartbeat.json");

export function writeHeartbeat() {
  try {
    writeFileSync(HEARTBEAT_PATH, JSON.stringify({ ts: Date.now(), pid: process.pid }), "utf8");
  } catch {
    /* best-effort */
  }
}

export function readHeartbeat() {
  if (!existsSync(HEARTBEAT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(HEARTBEAT_PATH, "utf8"));
  } catch {
    return null;
  }
}

/** True when the last heartbeat is older than maxAgeMs (or missing). */
export function isStale(maxAgeMs, now = Date.now()) {
  const hb = readHeartbeat();
  if (!hb || typeof hb.ts !== "number") return true;
  return now - hb.ts > maxAgeMs;
}
