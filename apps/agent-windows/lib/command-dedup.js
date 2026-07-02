// Exactly-once command execution.
//
// The server redelivers a command it marked "delivered" but never saw acked
// (COMMAND_REDELIVER_MINUTES) — so a lost ack, or the agent being offline/crashed
// past that window between running a command and acking it, means the SAME command
// arrives again. Without a guard the agent would run it twice: a duplicate parent
// "message" popup, a second screenshot upload, a redundant lock.
//
// This keeps a bounded log of already-run command ids. A redelivered command is
// re-acked (so the server stops redelivering) but NOT re-run. The log is small and
// persisted with the agent state so it survives a restart.

/**
 * @param {string[]} initialIds ids restored from persisted state
 * @param {number} cap max ids to retain (redelivery window is minutes, so a few
 *   hundred is far more than any realistic in-flight backlog)
 */
export function createCommandLog(initialIds = [], cap = 300) {
  const ids = Array.isArray(initialIds) ? initialIds.slice(-cap) : [];
  const set = new Set(ids);
  return {
    /** True if this command id has already been executed. */
    has(id) {
      return Boolean(id) && set.has(id);
    },
    /** Record a command id as executed (no-op for falsy/duplicate ids). */
    remember(id) {
      if (!id || set.has(id)) return;
      set.add(id);
      ids.push(id);
      if (ids.length > cap) {
        for (const evicted of ids.splice(0, ids.length - cap)) set.delete(evicted);
      }
    },
    /** Ids to persist (bounded, insertion order). */
    snapshot() {
      return ids.slice();
    },
  };
}
