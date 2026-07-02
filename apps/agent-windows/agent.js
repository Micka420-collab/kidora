#!/usr/bin/env node
// Kidora — Windows parental-control agent.
// Usage: node agent.js --token <enrollToken> --server <url> [--dry-run]
import { hostname } from "node:os";
import { resolveConfig, saveConfig } from "./lib/config.js";
import { Api, AGENT_VERSION } from "./lib/api.js";
import { Tracker } from "./lib/tracker.js";
import { Enforcer } from "./lib/enforcer.js";
import { loadState, saveState } from "./lib/store.js";
import { TrustedClock } from "./lib/clock.js";
import { startSensor, getBattery, isAdmin, updateHostsFile, hideOverlay, setSystemDns, restoreSystemDns, getForegroundBrowserUrl } from "./lib/win.js";
import { startDnsProxy } from "./lib/dns-proxy.js";
import { normalizeDomain, domainsForCategories } from "./lib/domains.js";
import { scanInstalledApps } from "./lib/scan-apps.js";
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

  // Restore durable state (last policy + today's usage + un-synced spool) so a
  // reboot or an offline start keeps enforcing and can't reset the child's
  // screen-time counter.
  const state = loadState();
  const tracker = new Tracker(state.tracker);
  const enforcer = new Enforcer({ dryRun: DRY_RUN });
  // Trusted clock — enforcement (bedtime/limits/day rollover) uses this instead
  // of the raw system clock so the child can't win time by changing the date.
  const clock = new TrustedClock(state.clock);

  /** Persist the current policy + tracker + clock snapshot atomically. Best-effort. */
  function persistState() {
    saveState({ policy, tracker: tracker.snapshot(), clock: clock.snapshot() });
  }

  // 1. Enroll — but degrade gracefully to OFFLINE mode when the server can't be
  //    reached. A control app that refuses to run without the network is worse
  //    than useless: the child just unplugs the router. With a cached policy we
  //    keep enforcing the last known rules and retry enroll on the sync loop.
  let policy = state.policy || null;
  let offline = false;
  let syncInterval = cfg.syncInterval;
  try {
    const res = await api.enroll({ hostname: hostname(), model: "Windows", agentVersion: AGENT_VERSION });
    policy = res.policy;
    syncInterval = res.syncIntervalSeconds || syncInterval;
    cfg.deviceId = res.deviceId;
    cfg.childId = res.childId;
    saveConfig(cfg);
    persistState();
    log.ok(`Enrôlé pour « ${res.childName} » (device ${res.deviceId})`);
  } catch (e) {
    if (policy && cfg.deviceId) {
      offline = true;
      log.warn(`Serveur injoignable (${e.message}). Mode hors-ligne : application de la dernière politique connue.`);
    } else {
      log.error("Échec de l'enrôlement et aucune politique en cache :", e.message);
      process.exit(1);
    }
  }

  // Full PC app scan (once, at startup, read-only) → sent on the first sync so
  // the parent sees EVERY installed app in the dashboard, ready to allow/block/
  // limit, without waiting for the child to open each one.
  let pendingInstalledApps = [];
  try {
    pendingInstalledApps = scanInstalledApps();
    if (pendingInstalledApps.length) log.ok(`Scan applis : ${pendingInstalledApps.length} applications installées détectées.`);
  } catch { /* scan unavailable → fall back to on-use detection */ }

  // Web filtering: prefer the local DNS proxy (category-level, catches new
  // domains); fall back to the hosts file if not admin or the port is taken.
  // The agent's own server host is always allow-listed so whitelist mode
  // (blockUnknown) can't sinkhole the connection to the server (self-lockout).
  const essentialHosts = essentialAllowHosts(cfg.server);
  const filter = { web: buildWeb(policy, essentialHosts), dns: null, blocked: new Map() };
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
    const now = clock.now(); // trusted time — immune to a tampered system clock
    tracker.tick(sample, SAMPLE_INTERVAL, now);
    const newVideo = videos.observe(sample);
    if (newVideo) {
      // best-effort: recover the URL (→ video id → thumbnail) from the address bar
      getForegroundBrowserUrl().then((u) => {
        if (u && /youtu\.?be|youtube\.com/i.test(u)) newVideo.url = u.startsWith("http") ? u : `https://${u}`;
      }).catch(() => {});
    }
    try {
      await enforcer.apply(policy, sample, tracker, now);
    } catch (e) {
      log.error("enforce:", e.message);
    }
  });

  // Liveness heartbeat (read by the SYSTEM guardian to detect a hung agent).
  // Piggyback a state save so the daily usage counter is on disk within ~30s
  // even between syncs — a reboot then loses seconds, never the whole day.
  writeHeartbeat();
  const heartbeatTimer = setInterval(() => {
    writeHeartbeat();
    persistState();
  }, 30_000);

  // 3. Sync loop (telemetry up, policy + commands down)
  async function syncOnce() {
    writeHeartbeat();
    const { usage, events } = tracker.drain();
    const enforceEvents = enforcer.drainEvents();
    const webVisits = drainBlockedHosts(filter.blocked);
    const watchedVideos = videos.drain();
    const cmdResults = pendingCmdResults.splice(0);
    const battery = await getBattery();
    try {
      const res = await api.sync({
        online: true,
        battery: battery ?? undefined,
        tzOffset: -new Date().getTimezoneOffset(), // minutes to add to UTC → local
        usage,
        events: [...events, ...enforceEvents],
        webVisits,
        videos: watchedVideos.length ? watchedVideos : undefined,
        commandResults: cmdResults,
        ...(pendingInstalledApps.length ? { installedApps: pendingInstalledApps } : {}),
      });
      pendingInstalledApps = []; // sent once; the tracker catches anything new after
      policy = res.policy;
      filter.web = buildWeb(policy, essentialHosts); // DNS proxy reads this live
      // Anchor the trusted clock on the server's authoritative time and flag a
      // tampered system clock (child moving the date to dodge bedtime/limits).
      if (res.serverTime) {
        const { skewMs, tampered } = clock.onServerTime(res.serverTime);
        if (tampered) {
          const mins = Math.round(skewMs / 60000);
          log.warn(`Horloge locale décalée de ${mins} min vs serveur — signalement anti-triche.`);
          tracker.pushEvent({
            type: "clock_change",
            title: "Modification de l'heure système détectée",
            detail: `Décalage d'environ ${mins} min par rapport au serveur`,
          });
        }
      }
      if (offline) {
        offline = false;
        log.ok("Reconnecté au serveur — politique à jour.");
      }
      persistState(); // cache the fresh policy + drained tracker for offline restart
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
      if (!offline) {
        offline = true;
        log.warn(`Serveur injoignable (${e.message}). Mode hors-ligne : la surveillance et les blocages continuent.`);
      } else {
        log.error("sync:", e.message);
      }
      // Transient failure → the server didn't commit, so re-queue everything we
      // drained instead of dropping it. Usage matters most: losing it would
      // under-count screen time and hand the child extra time.
      tracker.restore({ usage, events });
      enforcer.restoreEvents(enforceEvents);
      for (const v of webVisits) filter.blocked.set(v.domain, v.category ? `category:${v.category}` : "blocked");
      videos.restore(watchedVideos);
      if (cmdResults.length) pendingCmdResults.unshift(...cmdResults);
      persistState(); // keep the re-queued spool + counter on disk across a crash
    }
  }

  setInterval(syncOnce, syncInterval * 1000);
  log.info(`Surveillance active. Échantillon ${SAMPLE_INTERVAL}s · sync ${syncInterval}s. Ctrl+C pour arrêter.`);

  // graceful shutdown — restore system DNS/proxy so we never leave the machine
  // pointed at a dead local resolver. Handle SIGTERM too: under Task Scheduler
  // the process is stopped with SIGTERM/kill, not Ctrl+C (SIGINT).
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Arrêt…");
    clearInterval(heartbeatTimer);
    persistState(); // flush today's counter + un-synced spool before exiting
    hideOverlay();
    if (filter.dns) {
      try { await restoreSystemDns(); } catch {}
      try { filter.dns.stop(); } catch {}
    }
    try {
      await api.sync({ online: false });
    } catch {}
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Hosts the agent must ALWAYS reach (its own server + loopback) so whitelist
 *  mode (blockUnknown) can't sinkhole its connection to the server. */
function essentialAllowHosts(serverUrl) {
  const hosts = ["localhost", "127.0.0.1"];
  try { hosts.push(new URL(serverUrl).hostname); } catch { /* bad/relative url */ }
  return hosts;
}

/** Build the DNS-proxy view of the web policy (normalized Sets). `essentialHosts`
 *  are folded into the allow-list (explicit allow always wins in webDecision). */
function buildWeb(policy, essentialHosts = []) {
  const w = policy?.webFilter || {};
  const norm = (arr) => new Set((arr || []).map((d) => normalizeDomain(d)));
  return {
    blockedDomains: norm(policy?.blockedDomains),
    allowedDomains: norm([...(policy?.allowedDomains || []), ...essentialHosts]),
    blockedCategories: new Set(w.blockedCategories || []),
    blockUnknown: !!w.blockUnknown,
    safeSearch: !!w.safeSearch,
  };
}

/** Turn collected DNS blocks into webVisit rows (deduped, capped). */
function drainBlockedHosts(map) {
  const rows = [];
  for (const [domain, reason] of map) {
    if (rows.length >= 100) break;
    rows.push({
      domain,
      category: reason && reason.startsWith("category:") ? reason.slice("category:".length) : undefined,
      blocked: true,
    });
  }
  // Only clear what we actually drained; the rest carries over to the next sync
  // (previously map.clear() dropped every block past the first 100).
  for (const r of rows) map.delete(r.domain);
  return rows;
}

function hostsKey(policy) {
  // Include categories: a category change must also refresh the hosts fallback.
  return JSON.stringify([
    (policy?.blockedDomains || []).slice().sort(),
    (policy?.webFilter?.blockedCategories || []).slice().sort(),
  ]);
}

function applyHosts(policy, admin) {
  if (!admin) return;
  // The hosts fallback can't categorize at query time like the DNS proxy, so
  // expand blocked categories to their known domains and block those too —
  // otherwise category filtering (social, adult…) is a no-op in fallback mode.
  const catDomains = domainsForCategories(policy?.webFilter?.blockedCategories || []);
  const all = [...(policy.blockedDomains || []), ...catDomains];
  const res = updateHostsFile(all);
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
