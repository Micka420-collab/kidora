// Kidora LAN advertiser — lets agents/installers on the same network find this
// server without typing its address. Run it alongside the server on a self-host
// box:  node scripts/lan-advertise.mjs            (auto-detects LAN IP + port)
//        node scripts/lan-advertise.mjs --url http://192.168.1.50:3000 --name Maison
//
// It answers Kidora discovery queries and periodically announces itself over an
// admin-scoped multicast group (matches apps/agent-windows/lib/discover.js).
import dgram from "node:dgram";
import os from "node:os";

const GROUP = "239.255.42.99";
const PORT = 5354;
const ANNOUNCE_EVERY_MS = 5000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** First non-internal IPv4 address (the LAN IP an agent should call). */
function lanIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const a of iface || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "127.0.0.1";
}

const port = arg("--port", process.env.PORT || "3000");
const url = (arg("--url", "") || `http://${lanIp()}:${port}`).replace(/\/$/, "");
const name = arg("--name", "Kidora");
const announce = Buffer.from(JSON.stringify({ k: "kidora-server", v: 1, url, name }), "utf8");

const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });

sock.on("message", (msg, rinfo) => {
  let o;
  try { o = JSON.parse(msg.toString("utf8")); } catch { return; }
  if (o && o.k === "kidora-discover") {
    sock.send(announce, rinfo.port, rinfo.address); // unicast reply to the asker
  }
});

sock.on("error", (e) => {
  console.error("[lan-advertise] socket error:", e.message);
  process.exit(1);
});

sock.bind(PORT, () => {
  try { sock.addMembership(GROUP); } catch { /* interface without multicast */ }
  console.log(`[lan-advertise] announcing ${name} → ${url} on ${GROUP}:${PORT}`);
  const beat = () => sock.send(announce, PORT, GROUP, () => {});
  beat();
  setInterval(beat, ANNOUNCE_EVERY_MS);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { try { sock.close(); } catch {} process.exit(0); });
}
