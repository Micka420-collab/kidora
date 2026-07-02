// Durable on-disk state for the agent — the backbone of offline (hors-ligne)
// operation. Persists two things next to config.json:
//
//   • the last known effective policy, so a machine that reboots with no network
//     (or while the server is down) keeps enforcing the real rules instead of
//     starting wide-open;
//   • the tracker snapshot (today's per-app usage + the un-synced telemetry
//     spool), so a reboot can't reset the child's daily screen-time counter —
//     rebooting to win back screen time is the classic way kids defeat these
//     tools, and losing usage would also under-count time and hand out extra.
//
// Writes are atomic (temp file + rename) so a crash mid-write can never leave a
// half-written, unparseable state file that would wipe enforcement on restart.
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { statePath } from "./paths.js";

const STATE_PATH = statePath();
const TMP_PATH = STATE_PATH + ".tmp";

const STATE_VERSION = 1;

/** Read the persisted state, or an empty object if absent/corrupt. Never throws. */
export function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    // Ignore a state file from an incompatible future/older shape rather than
    // trusting fields that may have changed meaning.
    if (raw && typeof raw === "object" && raw.v === STATE_VERSION) return raw;
    return {};
  } catch {
    return {};
  }
}

/** Atomically persist state. Best-effort: a disk error must never crash the
 *  agent (enforcement continues from memory). */
export function saveState(state) {
  try {
    const payload = JSON.stringify({ v: STATE_VERSION, ...state });
    writeFileSync(TMP_PATH, payload, "utf8");
    renameSync(TMP_PATH, STATE_PATH); // atomic on same volume
    return true;
  } catch {
    try { if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH); } catch { /* ignore */ }
    return false;
  }
}

/** Probe whether the agent can actually write its state directory (the offline
 *  cache lives here). Under a hardened standard-user account the self-protect
 *  ACLs can make it read-only — `kidora-agent doctor` surfaces that. Writes and
 *  removes a throwaway file; never touches the real state. */
export function canWriteStateDir() {
  const probe = STATE_PATH + ".probe";
  try {
    writeFileSync(probe, "ok", "utf8");
    unlinkSync(probe);
    return true;
  } catch {
    try { if (existsSync(probe)) unlinkSync(probe); } catch { /* ignore */ }
    return false;
  }
}

export { STATE_PATH };
