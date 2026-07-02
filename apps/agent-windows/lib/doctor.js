// `kidora-agent doctor` — a self-diagnostic that answers the one question an
// installer or a support call actually has: "is this thing working, and if not,
// what's wrong?". Each check returns {name,status,detail}; the CLI prints a
// colour-coded checklist and exits non-zero if anything is broken. The pure
// check functions take their inputs directly so they're unit-testable; the CLI
// wires the real system probes.
export const STATUS = { OK: "ok", WARN: "warn", FAIL: "fail" };

const res = (name, status, detail) => ({ name, status, detail });

export function checkNode(versionString = process.version) {
  const major = parseInt(String(versionString).replace(/^v/, "").split(".")[0], 10);
  if (!Number.isFinite(major)) return res("Node.js", STATUS.WARN, `version illisible (${versionString})`);
  if (major >= 18) return res("Node.js", STATUS.OK, `${versionString}`);
  return res("Node.js", STATUS.FAIL, `${versionString} — Node 18+ requis`);
}

export function checkConfig(cfg = {}) {
  const missing = [];
  if (!cfg.enrollToken) missing.push("jeton");
  if (!cfg.server) missing.push("serveur");
  if (missing.length) return res("Configuration", STATUS.FAIL, `manquant : ${missing.join(", ")} — relancez l'installeur`);
  return cfg.deviceId
    ? res("Configuration", STATUS.OK, `serveur ${cfg.server}`)
    : res("Configuration", STATUS.WARN, `serveur ${cfg.server} — appareil pas encore enrôlé`);
}

export async function checkServer(server, fetchImpl = fetch, timeoutMs = 8000) {
  if (!server) return res("Serveur joignable", STATUS.FAIL, "aucune URL de serveur configurée");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${server.replace(/\/$/, "")}/api/health`, { signal: ctrl.signal });
    if (r.ok) return res("Serveur joignable", STATUS.OK, `${server} (HTTP ${r.status})`);
    return res("Serveur joignable", STATUS.WARN, `${server} a répondu HTTP ${r.status}`);
  } catch (e) {
    const why = e?.name === "AbortError" ? "timeout" : e?.message || "erreur";
    return res("Serveur joignable", STATUS.FAIL, `injoignable (${why}) — l'agent appliquera la politique en cache hors-ligne`);
  } finally {
    clearTimeout(timer);
  }
}

export function checkHeartbeat(hb, now = Date.now(), maxAgeMs = 120000) {
  if (!hb || typeof hb.ts !== "number") {
    return res("Agent en cours d'exécution", STATUS.WARN, "aucun heartbeat — l'agent n'a jamais démarré ?");
  }
  const age = now - hb.ts;
  if (age <= maxAgeMs) return res("Agent en cours d'exécution", STATUS.OK, `actif (heartbeat il y a ${Math.round(age / 1000)}s, pid ${hb.pid})`);
  return res("Agent en cours d'exécution", STATUS.WARN, `heartbeat périmé (${Math.round(age / 1000)}s) — agent arrêté ou figé`);
}

export function checkAdmin(isAdmin) {
  return isAdmin
    ? res("Droits administrateur", STATUS.OK, "filtrage web par DNS disponible")
    : res("Droits administrateur", STATUS.WARN, "non-admin — filtrage web et certains blocages limités");
}

export function checkStateWritable(canWrite) {
  return canWrite
    ? res("Persistance hors-ligne", STATUS.OK, "state.json accessible en écriture")
    : res("Persistance hors-ligne", STATUS.WARN, "écriture de state.json impossible — cache hors-ligne dégradé (ACL / compte ?)");
}

export function checkTask(label, present, running) {
  if (present === null || present === undefined) return res(`Tâche ${label}`, STATUS.WARN, "vérification impossible");
  if (!present) return res(`Tâche ${label}`, STATUS.FAIL, "absente — relancez install-agent.ps1");
  return running
    ? res(`Tâche ${label}`, STATUS.OK, "enregistrée et en cours")
    : res(`Tâche ${label}`, STATUS.WARN, "enregistrée (pas en cours) — démarrera au prochain logon/boot");
}

/** Worst status across results — drives the process exit code. */
export function worstStatus(results) {
  if (results.some((r) => r.status === STATUS.FAIL)) return STATUS.FAIL;
  if (results.some((r) => r.status === STATUS.WARN)) return STATUS.WARN;
  return STATUS.OK;
}

const ICON = { ok: "\x1b[32m✓\x1b[0m", warn: "\x1b[33m⚠\x1b[0m", fail: "\x1b[31m✗\x1b[0m" };

/** Render the checklist as a human-friendly report (returned as a string so it's
 *  testable; the CLI just prints it). */
export function formatReport(results) {
  const lines = ["", "  Kidora — diagnostic de l'agent", "  ------------------------------"];
  for (const r of results) {
    lines.push(`  ${ICON[r.status] || "?"} ${r.name.padEnd(28)} ${r.detail || ""}`.trimEnd());
  }
  const worst = worstStatus(results);
  lines.push("  ------------------------------");
  lines.push(
    worst === STATUS.OK
      ? "  Tout est opérationnel. ✓"
      : worst === STATUS.WARN
        ? "  Fonctionnel, avec des avertissements (voir ⚠)."
        : "  Problème(s) bloquant(s) détecté(s) (voir ✗).",
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * Gather all checks using injected system probes and return { results, report,
 * exitCode }. Probes default to no-ops so this is safe to call in tests; the CLI
 * passes real implementations.
 */
export async function runDoctor({
  version = process.version,
  cfg = {},
  fetchImpl = fetch,
  heartbeat = null,
  isAdmin = false,
  canWriteState = true,
  agentTask = { present: null, running: false },
  guardianTask = { present: null, running: false },
  now = Date.now(),
} = {}) {
  const results = [
    checkNode(version),
    checkConfig(cfg),
    await checkServer(cfg.server, fetchImpl),
    checkHeartbeat(heartbeat, now),
    checkAdmin(isAdmin),
    checkStateWritable(canWriteState),
    checkTask("KidoraAgent", agentTask.present, agentTask.running),
    checkTask("KidoraGuardian", guardianTask.present, guardianTask.running),
  ];
  const worst = worstStatus(results);
  return { results, report: formatReport(results), exitCode: worst === STATUS.FAIL ? 1 : 0 };
}
