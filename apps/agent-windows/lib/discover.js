// LAN server discovery — so the agent/installer can find the Kidora server on
// the local network without anyone typing its address.
//
// This is a lightweight UDP multicast beacon (mDNS-style: an admin-scoped
// multicast group), not full DNS-SD. Both ends are ours, so we don't need
// Bonjour/Avahi interop — a tiny JSON query/announce is enough and far more
// reliable across Windows firewalls and interfaces than a hand-rolled DNS-SD
// responder. The self-host server advertises with scripts/lan-advertise.mjs.
import dgram from "node:dgram";

export const GROUP = "239.255.42.99"; // admin-scoped (site-local) multicast
export const PORT = 5354;
const MAGIC_QUERY = "kidora-discover";
const MAGIC_ANNOUNCE = "kidora-server";

/** A discovery query broadcast by an agent/installer looking for the server. */
export function encodeQuery() {
  return Buffer.from(JSON.stringify({ k: MAGIC_QUERY, v: 1 }), "utf8");
}

/** The server's announcement of itself. */
export function encodeAnnounce(url, name = "Kidora") {
  return Buffer.from(JSON.stringify({ k: MAGIC_ANNOUNCE, v: 1, url, name }), "utf8");
}

/** Parse a beacon message; returns the object for known kinds, else null. */
export function parseMessage(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!o || (o.k !== MAGIC_QUERY && o.k !== MAGIC_ANNOUNCE)) return null;
  return o;
}

/** True for a well-formed server announcement carrying a usable URL. */
export function isServerAnnounce(o) {
  return !!o && o.k === MAGIC_ANNOUNCE && typeof o.url === "string" && /^https?:\/\//i.test(o.url);
}

/**
 * Discover Kidora servers on the LAN. Sends a multicast query and collects
 * announcements for `timeoutMs`. Best-effort: resolves to a (possibly empty)
 * list of `{ url, name }`, never rejects — multicast may be blocked by a
 * firewall or unavailable on the interface.
 */
export function discover({ timeoutMs = 2500, group = GROUP, port = PORT } = {}) {
  return new Promise((resolve) => {
    const found = new Map(); // url -> name
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* ignore */ }
      resolve([...found.entries()].map(([url, name]) => ({ url, name })));
    };
    sock.on("error", finish);
    sock.on("message", (msg) => {
      const o = parseMessage(msg);
      if (isServerAnnounce(o)) found.set(o.url, o.name || "Kidora");
    });
    try {
      // Bind an EPHEMERAL port (not the group port): the server answers our query
      // with a UNICAST reply, so we avoid the same-port multicast-delivery clash
      // that stops two sockets on one host from both receiving group traffic.
      sock.bind(0, () => {
        try { sock.setMulticastLoopback(true); } catch { /* same-host advertiser still reachable via LAN */ }
        try { sock.setMulticastTTL(4); } catch { /* ignore */ }
        const q = encodeQuery();
        const shoot = () => { if (!done) sock.send(q, port, group, () => {}); };
        shoot();
        setTimeout(shoot, Math.min(700, timeoutMs / 2));
      });
    } catch {
      return finish();
    }
    setTimeout(finish, timeoutMs);
  });
}
