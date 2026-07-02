// Talks to the Kidora server agent API.
const AGENT_VERSION = "1.0.0";
const REQUEST_TIMEOUT_MS = 15000; // a hung/unreachable server must not freeze the loop

/** fetch() with a hard timeout — without it, a dropped connection or a captive
 *  portal that accepts the socket but never replies would hang the sync loop
 *  forever (no enforcement refresh, no telemetry). AbortController guarantees the
 *  request either completes or rejects within the deadline so the caller can
 *  re-queue and retry on the next tick. */
async function fetchWithTimeout(url, opts = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    // Normalize the abort into a clear, catchable "offline"-style error.
    if (e?.name === "AbortError") throw new Error(`timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export class Api {
  constructor(server, token) {
    this.server = server.replace(/\/$/, "");
    this.token = token;
  }

  async enroll(deviceInfo) {
    const res = await fetchWithTimeout(`${this.server}/api/agent/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollToken: this.token, deviceInfo }),
    });
    if (!res.ok) throw new Error(`enroll failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async uploadScreenshot(dataUrl, commandId) {
    const res = await fetchWithTimeout(`${this.server}/api/agent/screenshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ dataUrl, commandId }),
    }, 30000); // screenshots are larger — allow more headroom
    if (!res.ok) throw new Error(`screenshot failed: ${res.status}`);
    return res.json();
  }

  async sync(payload) {
    const res = await fetchWithTimeout(`${this.server}/api/agent/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ agentVersion: AGENT_VERSION, ...payload }),
    });
    if (!res.ok) throw new Error(`sync failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

export { AGENT_VERSION, fetchWithTimeout };
