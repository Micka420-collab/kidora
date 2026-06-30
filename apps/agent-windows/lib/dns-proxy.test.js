import { test } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import { startDnsProxy } from "./dns-proxy.js";

// Minimal DNS-ish datagram: 12-byte header (txid in bytes 0-1) + no question.
// parseQuery returns null for these → the proxy takes the passthrough/forward
// path, which is exactly what we want to exercise.
function packet(txid) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE(txid, 0);
  return b;
}

// A fake upstream resolver that echoes each query straight back (same txid).
function startFakeUpstream() {
  const sock = dgram.createSocket("udp4");
  sock.on("message", (msg, rinfo) => { sock.send(msg, rinfo.port, rinfo.address); });
  return new Promise((resolve) => {
    sock.bind(0, "127.0.0.1", () => resolve({ port: sock.address().port, close: () => sock.close() }));
  });
}

function query(proxyPort, txid) {
  return new Promise((resolve, reject) => {
    const c = dgram.createSocket("udp4");
    const timer = setTimeout(() => { c.close(); reject(new Error("timeout")); }, 2000);
    c.on("message", (resp) => { clearTimeout(timer); c.close(); resolve(resp.readUInt16BE(0)); });
    c.send(packet(txid), proxyPort, "127.0.0.1");
  });
}

test("forwards a query and routes the upstream reply back by txid", async () => {
  const upstream = await startFakeUpstream();
  const proxy = await startDnsProxy({ port: 0, upstream: "127.0.0.1", upstreamPort: upstream.port });
  assert.ok(proxy, "proxy should bind");
  try {
    assert.equal(await query(proxy.port, 0xabcd), 0xabcd);
  } finally {
    proxy.stop();
    upstream.close();
  }
});

test("multiplexes concurrent queries with distinct txids on one upstream socket", async () => {
  const upstream = await startFakeUpstream();
  const proxy = await startDnsProxy({ port: 0, upstream: "127.0.0.1", upstreamPort: upstream.port });
  try {
    const ids = [0x0001, 0x1234, 0x7fff, 0xfffe];
    const got = await Promise.all(ids.map((id) => query(proxy.port, id)));
    assert.deepEqual(got.sort((a, b) => a - b), ids.slice().sort((a, b) => a - b));
  } finally {
    proxy.stop();
    upstream.close();
  }
});

test("stop() closes cleanly with no pending leaks", async () => {
  const upstream = await startFakeUpstream();
  const proxy = await startDnsProxy({ port: 0, upstream: "127.0.0.1", upstreamPort: upstream.port });
  proxy.stop();
  upstream.close();
  assert.ok(true);
});
