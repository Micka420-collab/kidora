#!/usr/bin/env node
// Kidora — Windows parental-control agent.
// Usage: node agent.js --token <enrollToken> --server <url> [--dry-run]
import { hostname } from "node:os";
import { resolveConfig, saveConfig } from "./lib/config.js";
import { Api, AGENT_VERSION } from "./lib/api.js";
import { Tracker } from "./lib/tracker.js";
import { Enforcer } from "./lib/enforcer.js";
import { startSensor, getBattery, isAdmin, updateHostsFile } from "./lib/win.js";
import { log } from "./lib/logger.js";

const SAMPLE_INTERVAL = 5; // seconds between foreground samples
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

async function main() {
  const cfg = resolveConfig(argv);
  if (!cfg.enrollToken) {
    log.error("Aucun jeton. Lancez : node agent.js --token <ENROLL_TOKEN> --server <URL>");
    process.exit(1);
  }

  // Used by the installer to persist config without starting the loop.
  if (argv.includes("--enroll-only")) {
    saveConfig(cfg);
    log.ok("Configuration enregistrée.");
    process.exit(0);
  }

  console.log("\n  \x1b[1m\x1b[35mKidora Agent\x1b[0m  v" + AGENT_VERSION + (DRY_RUN ? "  \x1b[33m[DRY-RUN]\x1b[0m" : ""));
  console.log("  Serveur : " + cfg.server + "\n");

  const admin = await isAdmin();
  if (!admin) log.warn("Non administrateur — le filtrage web (hosts) et certains blocages seront limités.");

  const api = new Api(cfg.server, cfg.enrollToken);
  const tracker = new Tracker();
  const enforcer = new Enforcer({ dryRun: DRY_RUN });

  // 1. Enroll
  let policy = null;
  let syncInterval = cfg.syncInterval;
  try {
    const res = await api.enroll({ hostname: hostname(), model: "Windows", agentVersion: AGENT_VERSION });
    policy = res.policy;
    syncInterval = res.syncIntervalSeconds || syncInterval;
    cfg.deviceId = res.deviceId;
    cfg.childId = res.childId;
    saveConfig(cfg);
    log.ok(`Enrôlé pour « ${res.childName} » (device ${res.deviceId})`);
    applyHosts(policy, admin);
  } catch (e) {
    log.error("Échec de l'enrôlement :", e.message);
    process.exit(1);
  }

  let lastHostsKey = hostsKey(policy);
  const pendingCmdResults = [];
  let lastSample = null;

  // 2. Sensor loop (frequent sampling + live enforcement)
  startSensor(SAMPLE_INTERVAL, async (sample) => {
    lastSample = sample;
    tracker.tick(sample, SAMPLE_INTERVAL);
    try {
      await enforcer.apply(policy, sample, tracker);
    } catch (e) {
      log.error("enforce:", e.message);
    }
  });

  // 3. Sync loop (telemetry up, policy + commands down)
  async function syncOnce() {
    const { usage, events } = tracker.drain();
    const enforceEvents = enforcer.drainEvents();
    const battery = await getBattery();
    try {
      const res = await api.sync({
        online: true,
        battery: battery ?? undefined,
        usage,
        events: [...events, ...enforceEvents],
        commandResults: pendingCmdResults.splice(0),
      });
      policy = res.policy;
      const total = Math.round(tracker.totalTodaySeconds() / 60);
      log.event(
        `sync ✓  usage:${usage.length} events:${events.length + enforceEvents.length}  écran aujourd'hui:${total}min  ${policy.paused ? "[PAUSE]" : ""}`,
      );

      // refresh hosts file if block list changed
      const key = hostsKey(policy);
      if (key !== lastHostsKey) {
        lastHostsKey = key;
        applyHosts(policy, admin);
      }

      // execute commands
      for (const cmd of res.commands || []) {
        await handleCommand(cmd, pendingCmdResults, enforcer);
      }
    } catch (e) {
      log.error("sync:", e.message);
    }
  }

  setInterval(syncOnce, syncInterval * 1000);
  log.info(`Surveillance active. Échantillon ${SAMPLE_INTERVAL}s · sync ${syncInterval}s. Ctrl+C pour arrêter.`);

  // graceful shutdown
  process.on("SIGINT", async () => {
    log.info("Arrêt…");
    try {
      await api.sync({ online: false });
    } catch {}
    process.exit(0);
  });
}

function hostsKey(policy) {
  return (policy?.blockedDomains || []).slice().sort().join(",");
}

function applyHosts(policy, admin) {
  if (!admin) return;
  const res = updateHostsFile(policy.blockedDomains || []);
  if (res.ok) log.ok(`Filtrage web : ${res.count} domaine(s) bloqué(s) via hosts.`);
  else log.warn(`Filtrage web indisponible (${res.reason}).`);
}

async function handleCommand(cmd, results, enforcer) {
  log.info(`Commande reçue : ${cmd.type}`);
  const { notify, lockWorkstation } = await import("./lib/win.js");
  try {
    switch (cmd.type) {
      case "lock":
      case "pause":
        if (!enforcer.dryRun) await lockWorkstation();
        results.push({ id: cmd.id, status: "done" });
        break;
      case "message":
        if (!enforcer.dryRun) notify("Message de vos parents", cmd.payload?.text || "Bonjour !");
        results.push({ id: cmd.id, status: "done" });
        break;
      case "resume":
      case "unlock":
        results.push({ id: cmd.id, status: "done" });
        break;
      case "locate":
        results.push({ id: cmd.id, status: "failed", result: "Localisation non disponible sur Windows." });
        break;
      default:
        results.push({ id: cmd.id, status: "failed", result: "type non supporté" });
    }
  } catch (e) {
    results.push({ id: cmd.id, status: "failed", result: e.message });
  }
}

main().catch((e) => {
  log.error("Erreur fatale :", e);
  process.exit(1);
});
