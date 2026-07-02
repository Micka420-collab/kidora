// Where the agent keeps its RUNTIME (writable) files.
//
// The self-protection ACLs make the install directory read-only for the child's
// standard account — which is right for the SCRIPTS (they must not be tampered),
// but means the agent, running as that child, cannot write its own runtime state
// (heartbeat, offline cache, update staging) there. So writable files live in
// %ProgramData%\Kidora instead: a standard user can write it, while SYSTEM (the
// guardian) and Administrators can still read/replace it. The guardian and the
// installer resolve the SAME deterministic path, so no coordination file is
// needed. Falls back to the install dir when %ProgramData% is unavailable
// (non-Windows / dev), preserving the previous behaviour exactly.
import { existsSync, mkdirSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files that are RUNTIME state (written by the running agent) — migrated from a
// legacy install-dir location on upgrade so enrollment/usage survive.
const LEGACY_MIGRATE = ["config.json", "state.json"];

function probeWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.w${process.pid}`);
    writeFileSync(probe, "x");
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

let cached = null;

/** Resolve (once) the writable data directory. */
export function dataDir() {
  if (cached) return cached;
  const candidates = [];
  if (process.env.KIDORA_DATA_DIR) candidates.push(process.env.KIDORA_DATA_DIR);
  if (process.platform === "win32") {
    const pd = process.env.ProgramData || process.env.PROGRAMDATA;
    if (pd) candidates.push(join(pd, "Kidora"));
  } else {
    // Linux/macOS: a system data dir for a root service, else the user's XDG dir.
    candidates.push("/var/lib/kidora");
    const xdg = process.env.XDG_DATA_HOME || (process.env.HOME ? join(process.env.HOME, ".local", "share") : null);
    if (xdg) candidates.push(join(xdg, "kidora"));
  }
  for (const dir of candidates) {
    if (probeWritable(dir)) {
      cached = dir;
      if (cached !== AGENT_DIR) migrateLegacy(cached);
      return cached;
    }
  }
  cached = AGENT_DIR; // last resort — same as the historical behaviour
  return cached;
}

/** Copy legacy runtime files from the install dir into the data dir on first use
 *  (upgrade path), so an existing enrollment + today's counter aren't lost. */
function migrateLegacy(dir) {
  for (const name of LEGACY_MIGRATE) {
    const dest = join(dir, name);
    const src = join(AGENT_DIR, name);
    if (!existsSync(dest) && existsSync(src)) {
      try { copyFileSync(src, dest); } catch { /* best-effort */ }
    }
  }
}

export const configPath = () => join(dataDir(), "config.json");
export const heartbeatPath = () => join(dataDir(), "heartbeat.json");
export const statePath = () => join(dataDir(), "state.json");
export const overlayStatePath = () => join(dataDir(), "overlay-state.json");
export const stagingDir = () => join(dataDir(), ".update-staging");
export const backupDirPath = () => join(dataDir(), ".update-backup");

// Test seam.
export function _resetForTests() {
  cached = null;
}
