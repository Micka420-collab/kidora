#!/usr/bin/env node
// Kidora — Windows parental-control agent.
// Usage: node agent.js --token <enrollToken> --server <url> [--dry-run]
import { hostname } from "node:os";
import { resolveConfig, saveConfig } from "./lib/config.js";
import { Api, AGENT_VERSION } from "./lib/api.js";
import { Tracker } from "./lib/tracker.js";
import { Enforcer } from "./lib/enforcer.js";
import { startSensor, getBattery, isAdmin, updateHostsFile, hideOverlay, setSystemDns, restoreSystemDns, getForegroundBrowserUrl } from "./lib/win.js";
import { startDnsProxy } from "./lib/dns-proxy.js";
import { normalizeDomain } from "./lib/domains.js";
import { VideoCollector } from "./lib/videos.js";
import { writeHeartbeat } from "./lib/heartbeat.js";
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
  } catch (e) {
    log.error("Échec de l'enrôlement :", e.message);
    process.exit(1);
  }

  // Web filtering: prefer the local DNS proxy (category-level, catches new
  // domains); fall back to the hosts file if not admin or the port is taken.
  const filter = { web: buildWeb(policy), dns: null, blocked: new Map() };
  let lastHostsKey = hostsKey(policy);
  if (DRY_RUN) {
    log.info("[dry-run] filtrage web non appliqué.");
  } else if (admin) {
    filter.dns = await startDnsProxy({
      getWeb: () => filter.web,
      onEvent: (e) => { if (e.type === "dns_block") filter.blocked.set(e.host, e.reason); },
    });
    if (filter.dns) {
      await setSystemDns("127.0.0.1");
      updateHostsFile([]); // DNS handles filtering now — clear any old hosts block
      log.ok("Filtrage web par catégorie actif (proxy DNS local).");
    } else {
      // Bind failed: make sure a previous instance didn't leave system DNS
      // pointing at a now-dead 127.0.0.1 (which would break resolution).
      try { await restoreSystemDns(); } catch {}
      applyHosts(policy, admin); // hosts fallback
    }
  } else {
    applyHosts(policy, admin); // non-admin: no-op + warning
  }

  const pendingCmdResults = [];
  let lastSample = null;

  // Clear any block overlay left over by a previously-crashed agent instance.
  hideOverlay();

  const videos = new VideoCollector(); // detects watched YouTube videos by window title

  // 2. Sensor loop (frequent sampling + live enforcement)
  startSensor(SAMPLE_INTERVAL, async (sample) => {
    lastSample = sample;
    tracker.tick(sample, SAMPLE_INTERVAL);
    const newVideo = videos.observe(sample);
    if (newVideo) {
      // best-effort: recover the URL (→ video id → thumbnail) from the address bar
      getForegroundBrowserUrl().then((u) => {
        if (u && /youtu\.?be|youtube\.com/i.test(u)) newVideo.url = u.startsWith("http") ? u : `https://${u}`;
      }).catch(() => {});
    }
    try {
      await enforcer.apply(policy, sample, tracker);
    } catch (e) {
      log.error("enforce:", e.message);
    }
  });

  // Liveness heartbeat (read by the SYSTEM guardian to detect a hung agent).
  writeHeartbeat();
  const heartbeatTimer = setInterval(writeHeartbeat, 30_000);

  // 3. Sync loop (telemetry up, policy + commands down)
  async function syncOnce() {
    writeHeartbeat();
    const { usage, events } = tracker.drain();
    const enforceEvents = enforcer.drainEvents();
    const webVisits = drainBlockedHosts(filter.blocked);
    const watchedVideos = videos.drain();
    const battery = await getBattery();
    try {
      const res = await api.sync({
        online: true,
        battery: battery ?? undefined,
        usage,
        events: [...events, ...enforceEvents],
        webVisits,
        videos: watchedVideos.length ? watchedVideos : undefined,
        commandResults: pendingCmdResults.splice(0),
      });
      policy = res.policy;
      filter.web = buildWeb(policy); // DNS proxy reads this live
      const total = Math.round(tracker.totalTodaySeconds() / 60);
      log.event(
        `sync ✓  usage:${usage.length} events:${events.length + enforceEvents.length} bloqués(dns):${webVisits.length}  écran:${total}min  ${policy.paused ? "[PAUSE]" : ""}`,
      );

      // hosts fallback: refresh only when the DNS proxy is NOT handling filtering
      const key = hostsKey(policy);
      if (!filter.dns && key !== lastHostsKey) {
        lastHostsKey = key;
        applyHosts(policy, admin);
      }

      // execute commands
      for (const cmd of res.commands || []) {
        await handleCommand(cmd, pendingCmdResults, enforcer, api);
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
    clearInterval(heartbeatTimer);
    hideOverlay();
    if (filter.dns) {
      try { await restoreSystemDns(); } catch {}
      filter.dns.stop();
    }
    try {
      await api.sync({ online: false });
    } catch {}
    process.exit(0);
  });
}

/** Build the DNS-proxy view of the web policy (normalized Sets). */
function buildWeb(policy) {
  const w = policy?.webFilter || {};
  const norm = (arr) => new Set((arr || []).map((d) => normalizeDomain(d)));
  return {
    blockedDomains: norm(policy?.blockedDomains),
    allowedDomains: norm(policy?.allowedDomains),
    blockedCategories: new Set(w.blockedCategories || []),
    blockUnknown: !!w.blockUnknown,
    safeSearch: !!w.safeSearch,
  };
}

/** Turn collected DNS blocks into webVisit rows (deduped, capped). */
function drainBlockedHosts(map) {
  const rows = [...map.entries()].slice(0, 100).map(([domain, reason]) => ({
    domain,
    category: reason && reason.startsWith("category:") ? reason.slice("category:".length) : undefined,
    blocked: true,
  }));
  map.clear();
  return rows;
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

async function handleCommand(cmd, results, enforcer, api) {
  log.info(`Commande reçue : ${cmd.type}`);
  const { notify, lockWorkstation, captureScreen } = await import("./lib/win.js");
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
      case "screenshot": {
        const b64 = await captureScreen();
        if (!b64) {
          results.push({ id: cmd.id, status: "failed", result: "capture impossible" });
          break;
        }
        await api.uploadScreenshot(`data:image/jpeg;base64,${b64}`, cmd.id);
        log.ok("Capture d'écran envoyée.");
        // status is set to done server-side via commandId; ack too
        results.push({ id: cmd.id, status: "done" });
        break;
      }
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
