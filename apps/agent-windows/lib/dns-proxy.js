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

  function forward(msg, rinfo) {
    const up = dgram.createSocket("udp4");
    const done = () => { try { up.close(); } catch { /* ignore */ } };
    const timer = setTimeout(done, 4000);
    up.on("message", (resp) => {
      clearTimeout(timer);
      try { server.send(resp, rinfo.port, rinfo.address); } catch { /* ignore */ }
      done();
    });
    up.on("error", () => { clearTimeout(timer); done(); });
    try { up.send(msg, upstreamPort, upstream); } catch { clearTimeout(timer); done(); }
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
        stop() { try { server.close(); } catch { /* ignore */ } },
      });
    });
  });
}
