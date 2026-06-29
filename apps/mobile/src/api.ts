import Constants from "expo-constants";
import * as storage from "./storage";

const DEFAULT_SERVER =
  (Constants.expoConfig?.extra?.defaultServer as string) || "http://localhost:3000";

export async function getServer(): Promise<string> {
  return (await storage.get("server")) || DEFAULT_SERVER;
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const server = await getServer();
  const res = await fetch(`${server}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

// ── Parent companion (token sent as session cookie header) ──
export const parent = {
  async login(email: string, password: string, server?: string) {
    if (server) await storage.set("server", server.replace(/\/$/, ""));
    const res = await req<{ id: string; name: string; token: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await storage.set("parentToken", res.token);
    await storage.set("role", "parent");
    return res;
  },
  async authHeader(): Promise<Record<string, string>> {
    const token = await storage.get("parentToken");
    return token ? { Cookie: `kidora_session=${token}` } : {};
  },
  async children() {
    return req<{ children: Child[] }>("/api/children", { headers: await this.authHeader() });
  },
  async child(id: string) {
    return req<{ child: ChildDetail }>(`/api/children/${id}`, { headers: await this.authHeader() });
  },
  async alerts() {
    return req<{ alerts: Alert[]; unread: number }>("/api/alerts", { headers: await this.authHeader() });
  },
};

// ── Child device agent (uses enroll token, Bearer auth) ──
export const childAgent = {
  async enroll(enrollToken: string, server: string, deviceInfo: object) {
    await storage.set("server", server.replace(/\/$/, ""));
    const res = await req<{ deviceId: string; childName: string; policy: Policy }>(
      "/api/agent/enroll",
      { method: "POST", body: { enrollToken, deviceInfo } },
    );
    await storage.set("enrollToken", enrollToken);
    await storage.set("role", "child");
    return res;
  },
  async sync(payload: object) {
    const token = await storage.get("enrollToken");
    if (!token) throw new Error("Appareil non enrôlé");
    return req<{ policy: Policy; commands: Command[] }>("/api/agent/sync", {
      method: "POST",
      body: payload,
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

// ── Types ──
export type Child = { id: string; name: string; avatar: string | null; devices: { online: boolean }[] };
export type ChildDetail = Child & { paused: boolean; screenTime: unknown; webFilter: unknown };
export type Alert = { id: string; message: string; ts: string; read: boolean; child: { name: string } };
export type Policy = { paused: boolean; blockedDomains: string[]; appRules: unknown[] };
export type Command = { id: string; type: string; payload: Record<string, unknown> };
