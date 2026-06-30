// Local DNS filtering proxy: a tiny sinkhole resolver. Listens on UDP, decides
// per query via the policy (category / blocklist / blockUnknown / safesearch),
// and either answers (block / safesearch CNAME) or forwards to an upstream
// resolver. This filters by CATEGORY at query time — including new domains the
// static hosts file never knew about.
import dgram from "node:dgram";
import { parseQuery, buildSinkhole, buildCname } from "./dns.js";
import { webDecision } from "./domains.js";
import { log } from "./logger.js";

/**
 * @param opts.getWeb  () => { blockedDomains:Set, allowedDomains:Set,
 *                             blockedCategories:Set, blockUnknown, safeSearch }
 * @param opts.onEvent (evt) => void   // { type:"dns_block", host, reason }
 * Resolves to a handle { stop(), port } or null if the bind failed
 * (e.g. not admin, or port 53 already in use).
 */
export function startDnsProxy(opts = {}) {
  const {
    host = "127.0.0.1",
    port = 53,
    upstream = "1.1.1.1",
    upstreamPort = 53,
    getWeb = () => ({}),
    onEvent,
  } = opts;

  const server = dgram.createSocket("udp4");

  // One shared upstream socket, multiplexed by DNS transaction id (first 2
  // bytes), rather than a fresh socket per query. System DNS routes through this
  // proxy, so a burst of cache-miss lookups previously allocated a socket/FD per
  // query (held ~4s) and could exhaust ephemeral ports/FDs machine-wide. This is
  // the standard forwarder design and degrades gracefully under load.
  const TIMEOUT_MS = 4000;
  const MAX_PENDING = 4096; // backstop against unbounded growth under a flood
  const pending = new Map(); // txid -> { rinfo, timer }
  const up = dgram.createSocket("udp4");

  up.on("message", (resp) => {
    if (resp.length < 2) return;
    const p = pending.get(resp.readUInt16BE(0));
    if (!p) return; // unknown or already-timed-out query
    clearTimeout(p.timer);
    pending.delete(resp.readUInt16BE(0));
    try { server.send(resp, p.rinfo.port, p.rinfo.address); } catch { /* ignore */ }
  });
  up.on("error", () => { /* keep the proxy alive; per-query timers reap pending */ });

  function forward(msg, rinfo) {
    if (msg.length < 2) return; // not a valid DNS message
    if (pending.size >= MAX_PENDING) return; // overloaded → drop; the client retries
    const txid = msg.readUInt16BE(0);
    const existing = pending.get(txid);
    if (existing) clearTimeout(existing.timer); // replace an in-flight duplicate
    const timer = setTimeout(() => pending.delete(txid), TIMEOUT_MS);
    pending.set(txid, { rinfo, timer });
    try { up.send(msg, upstreamPort, upstream); }
    catch { clearTimeout(timer); pending.delete(txid); }
  }

  server.on("message", (msg, rinfo) => {
    const q = parseQuery(msg);
    if (!q) return forward(msg, rinfo); // unparseable → pass through
    let decision;
    try { decision = webDecision(q.qname, getWeb()); } catch { decision = { action: "allow" }; }

    if (decision.action === "block") {
      try { server.send(buildSinkhole(q, msg), rinfo.port, rinfo.address); } catch { /* ignore */ }
      onEvent?.({ type: "dns_block", host: q.qname, reason: decision.reason });
      return;
    }
    if (decision.action === "safesearch") {
      try { server.send(buildCname(q, msg, decision.target), rinfo.port, rinfo.address); } catch { /* ignore */ }
      return;
    }
    forward(msg, rinfo);
  });

  return new Promise((resolve) => {
    let settled = false;
    server.once("error", (e) => {
      if (settled) { log.warn("dns-proxy:", e.message); return; }
      settled = true;
      log.warn(`Proxy DNS indisponible (${e.message}).`);
      resolve(null);
    });
    server.bind(port, host, () => {
      if (settled) return;
      settled = true;
      const boundPort = server.address().port;
      log.ok(`Proxy DNS actif ${host}:${boundPort} → upstream ${upstream}`);
      resolve({
        port: boundPort,
        stop() {
          for (const p of pending.values()) clearTimeout(p.timer);
          pending.clear();
          try { up.close(); } catch { /* ignore */ }
          try { server.close(); } catch { /* ignore */ }
        },
      });
    });
  });
}
