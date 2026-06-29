// Talks to the Kidora server agent API.
const AGENT_VERSION = "1.0.0";

export class Api {
  constructor(server, token) {
    this.server = server.replace(/\/$/, "");
    this.token = token;
  }

  async enroll(deviceInfo) {
    const res = await fetch(`${this.server}/api/agent/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollToken: this.token, deviceInfo }),
    });
    if (!res.ok) throw new Error(`enroll failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async uploadScreenshot(dataUrl, commandId) {
    const res = await fetch(`${this.server}/api/agent/screenshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ dataUrl, commandId }),
    });
    if (!res.ok) throw new Error(`screenshot failed: ${res.status}`);
    return res.json();
  }

  async sync(payload) {
    const res = await fetch(`${this.server}/api/agent/sync`, {
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

export { AGENT_VERSION };
